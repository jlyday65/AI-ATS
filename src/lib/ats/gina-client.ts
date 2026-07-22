import type { CandidateProfile, JobRequisition } from "@/lib/types";

export const GINA_DEFAULT_BASE_URL =
  process.env.GINA_ATS_BASE_URL ??
  "https://lyday-gina-backend-production.up.railway.app";

export interface GinaCredentials {
  baseUrl?: string;
  appPassword?: string;
  apiKey?: string;
}

export interface GinaConnectionTest {
  ok: boolean;
  healthOk: boolean;
  authenticated: boolean;
  baseUrl: string;
  probedRoutes: Array<{ path: string; status: number; ok: boolean }>;
  message: string;
  jobsFound?: number;
}

export interface GinaPushResult {
  ok: boolean;
  externalIds: string[];
  message: string;
  endpointUsed?: string;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

function collectCookies(response: Response): string {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookies =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean);

  return setCookies
    .map((value) => String(value).split(";")[0])
    .filter(Boolean)
    .join("; ");
}

async function loginWithAppPassword(
  baseUrl: string,
  appPassword: string,
): Promise<string | null> {
  const response = await fetch(`${baseUrl}/auth/app-login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "text/html,application/json",
    },
    body: new URLSearchParams({ password: appPassword }).toString(),
    redirect: "manual",
  });

  const cookies = collectCookies(response);
  const location = response.headers.get("location") ?? "";

  // Successful gate unlock typically redirects away from /?error=1
  if (cookies && !location.includes("error=1") && response.status >= 300 && response.status < 400) {
    return cookies;
  }

  // Some deployments may return 200 with a session cookie.
  if (cookies && response.status === 200 && !location.includes("error=1")) {
    return cookies;
  }

  return cookies || null;
}

function buildAuthHeaders(credentials: GinaCredentials, cookie?: string | null): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-SignalHire-Client": "ai-ats",
  };

  if (credentials.apiKey) {
    headers.Authorization = `Bearer ${credentials.apiKey}`;
    headers["X-API-Key"] = credentials.apiKey;
  }

  if (cookie) {
    headers.Cookie = cookie;
  }

  return headers;
}

async function requestGina(
  baseUrl: string,
  path: string,
  init: RequestInit,
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    // Railway ATS uses cookie sessions from the app-password gate.
    redirect: "manual",
  });
}

/**
 * Live connectivity check against Gina (Lyday Talent Partners ATS on Railway).
 */
export async function testGinaConnection(
  credentials: GinaCredentials = {},
): Promise<GinaConnectionTest> {
  const baseUrl = normalizeBaseUrl(credentials.baseUrl || GINA_DEFAULT_BASE_URL);
  const appPassword = credentials.appPassword || process.env.GINA_ATS_APP_PASSWORD || "";
  const apiKey = credentials.apiKey || process.env.GINA_ATS_API_KEY || "";

  let healthOk = false;
  try {
    const health = await fetch(`${baseUrl}/health`, { method: "GET" });
    healthOk = health.ok;
  } catch {
    return {
      ok: false,
      healthOk: false,
      authenticated: false,
      baseUrl,
      probedRoutes: [],
      message: `Gina ATS unreachable at ${baseUrl}`,
    };
  }

  let cookie: string | null = null;
  if (appPassword) {
    cookie = await loginWithAppPassword(baseUrl, appPassword);
  }

  const headers = buildAuthHeaders({ apiKey, appPassword }, cookie);
  const probePaths = [
    "/api/jobs",
    "/api/candidates",
    "/api/requisitions",
    "/api/positions",
    "/api/applications",
  ];

  const probedRoutes: GinaConnectionTest["probedRoutes"] = [];
  let authenticated = false;
  let jobsFound: number | undefined;

  for (const path of probePaths) {
    try {
      const response = await requestGina(baseUrl, path, { method: "GET", headers });
      const ok = response.status >= 200 && response.status < 300;
      probedRoutes.push({ path, status: response.status, ok });
      if (ok) {
        authenticated = true;
        if (path === "/api/jobs") {
          const payload = (await response.json().catch(() => null)) as
            | { jobs?: unknown[]; data?: unknown[] }
            | unknown[]
            | null;
          if (Array.isArray(payload)) {
            jobsFound = payload.length;
          } else if (payload && Array.isArray(payload.jobs)) {
            jobsFound = payload.jobs.length;
          } else if (payload && Array.isArray(payload.data)) {
            jobsFound = payload.data.length;
          }
        }
      }
      if (response.status === 401 || response.status === 403) {
        // keep probing — some routes may differ
      }
    } catch {
      probedRoutes.push({ path, status: 0, ok: false });
    }
  }

  if (!appPassword && !apiKey) {
    return {
      ok: healthOk,
      healthOk,
      authenticated: false,
      baseUrl,
      probedRoutes,
      message:
        "Gina health check passed, but no GINA_ATS_APP_PASSWORD or API key is configured yet.",
    };
  }

  if (!authenticated) {
    return {
      ok: false,
      healthOk,
      authenticated: false,
      baseUrl,
      probedRoutes,
      message:
        "Gina is reachable, but authentication failed. Check GINA_ATS_APP_PASSWORD / API key.",
    };
  }

  return {
    ok: true,
    healthOk,
    authenticated: true,
    baseUrl,
    probedRoutes,
    jobsFound,
    message:
      jobsFound != null
        ? `Connected to Gina ATS. Found ${jobsFound} job(s) via /api/jobs.`
        : "Connected to Gina ATS and authenticated successfully.",
  };
}

/**
 * Push ranked SignalHire candidates into Gina using discovered REST routes.
 */
export async function pushCandidatesToGina(input: {
  credentials?: GinaCredentials;
  job: JobRequisition;
  candidates: CandidateProfile[];
}): Promise<GinaPushResult> {
  const credentials = input.credentials ?? {};
  const baseUrl = normalizeBaseUrl(credentials.baseUrl || GINA_DEFAULT_BASE_URL);
  const appPassword = credentials.appPassword || process.env.GINA_ATS_APP_PASSWORD || "";
  const apiKey = credentials.apiKey || process.env.GINA_ATS_API_KEY || "";

  if (!appPassword && !apiKey) {
    return {
      ok: false,
      externalIds: [],
      message:
        "Missing Gina credentials. Set GINA_ATS_APP_PASSWORD (or API key) to sync into production.",
    };
  }

  const cookie = appPassword ? await loginWithAppPassword(baseUrl, appPassword) : null;
  const headers = buildAuthHeaders({ apiKey, appPassword }, cookie);

  const payload = {
    source: "signalhire",
    jobId: input.job.atsExternalId ?? input.job.id,
    jobTitle: input.job.title,
    candidates: input.candidates.map((candidate) => ({
      name: candidate.fullName,
      fullName: candidate.fullName,
      email: candidate.email,
      title: candidate.headline,
      headline: candidate.headline,
      location: candidate.location,
      skills: candidate.skills,
      experienceYears: candidate.experienceYears,
      summary: candidate.summary,
      notes: candidate.summary,
      linkedProfiles: candidate.platforms,
      source: "signalhire",
      tags: ["signalhire", "ai-sourced", ...candidate.platforms.map((p) => p.platformId)],
    })),
  };

  const endpoints = [
    "/api/candidates/import",
    "/api/candidates/bulk",
    "/api/candidates",
    "/api/applications",
  ];

  const errors: string[] = [];

  for (const endpoint of endpoints) {
    try {
      const response = await requestGina(baseUrl, endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const text = await response.text();

      if (response.status === 404 || response.status === 405) {
        errors.push(`${endpoint} → ${response.status}`);
        continue;
      }

      if (!response.ok) {
        errors.push(`${endpoint} → ${response.status}: ${text.slice(0, 160)}`);
        continue;
      }

      let externalIds: string[] = [];
      try {
        const json = JSON.parse(text) as {
          ids?: string[];
          candidates?: Array<{ id?: string }>;
          data?: Array<{ id?: string }>;
        };
        externalIds =
          json.ids ??
          json.candidates?.map((item) => item.id).filter(Boolean).map(String) ??
          json.data?.map((item) => item.id).filter(Boolean).map(String) ??
          [];
      } catch {
        externalIds = input.candidates.map((candidate) => candidate.id);
      }

      return {
        ok: true,
        externalIds,
        endpointUsed: endpoint,
        message: `Pushed ${input.candidates.length} candidate(s) to Gina via ${endpoint}.`,
      };
    } catch (error) {
      errors.push(
        `${endpoint} → ${error instanceof Error ? error.message : "network error"}`,
      );
    }
  }

  // Fallback: create candidates one-by-one on /api/candidates
  const createdIds: string[] = [];
  for (const candidate of payload.candidates) {
    try {
      const response = await requestGina(baseUrl, "/api/candidates", {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...candidate,
          jobId: payload.jobId,
          jobTitle: payload.jobTitle,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        errors.push(`single /api/candidates → ${response.status}: ${text.slice(0, 120)}`);
        continue;
      }
      const json = (await response.json().catch(() => null)) as { id?: string } | null;
      createdIds.push(json?.id ?? candidate.email ?? candidate.fullName);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "single create failed");
    }
  }

  if (createdIds.length) {
    return {
      ok: true,
      externalIds: createdIds,
      endpointUsed: "/api/candidates",
      message: `Created ${createdIds.length}/${input.candidates.length} candidates in Gina.`,
    };
  }

  return {
    ok: false,
    externalIds: [],
    message: `Gina candidate sync failed. ${errors.slice(0, 3).join(" | ")}`,
  };
}
