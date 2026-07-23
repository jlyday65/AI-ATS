import type { CandidateProfile, JobRequisition } from "@/lib/types";

export const GINA_DEFAULT_BASE_URL =
  process.env.GINA_ATS_BASE_URL ??
  "https://lyday-gina-backend-production.up.railway.app";

/** Bump when push routes change — appears in UI + sync text so we can verify local pull. */
export const GINA_CLIENT_VERSION = "ats-v10";

export interface GinaCredentials {
  baseUrl?: string;
  appPassword?: string;
  apiKey?: string;
  /** Shared bot secret used by Gina integrations (Railway RELAY_SECRET). */
  relaySecret?: string;
}

export interface GinaConnectionTest {
  ok: boolean;
  healthOk: boolean;
  authenticated: boolean;
  baseUrl: string;
  loginStatus?: number;
  loginLocation?: string;
  cookieReceived: boolean;
  authStrategy?: string;
  probedRoutes: Array<{ path: string; status: number; ok: boolean; snippet?: string }>;
  message: string;
  jobsFound?: number;
  nextStep?: string;
}

export interface GinaPushResult {
  ok: boolean;
  externalIds: string[];
  message: string;
  endpointUsed?: string;
  authStrategy?: string;
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
    .map((value) => String(value).split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

function mergeCookies(...parts: Array<string | null | undefined>): string {
  const map = new Map<string, string>();
  for (const part of parts) {
    if (!part) continue;
    for (const item of part.split(";")) {
      const trimmed = item.trim();
      if (!trimmed || !trimmed.includes("=")) continue;
      const [name, ...rest] = trimmed.split("=");
      map.set(name, rest.join("="));
    }
  }
  return [...map.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function loginWithAppPassword(
  baseUrl: string,
  appPassword: string,
): Promise<{ cookie: string | null; status: number; location: string }> {
  const response = await fetch(`${baseUrl}/auth/app-login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "text/html,application/json",
      Origin: baseUrl,
      Referer: `${baseUrl}/`,
    },
    body: new URLSearchParams({ password: appPassword }).toString(),
    redirect: "manual",
  });

  const location = response.headers.get("location") ?? "";
  const cookie = collectCookies(response);
  const failed = location.includes("error=1");

  return {
    cookie: failed ? null : cookie || null,
    status: response.status,
    location,
  };
}

type AuthAttempt = {
  strategy: string;
  headers: Record<string, string>;
};

function buildAuthAttempts(credentials: GinaCredentials, cookie?: string | null): AuthAttempt[] {
  const password = credentials.appPassword?.trim() || "";
  const apiKey = credentials.apiKey?.trim() || "";
  const relaySecret = credentials.relaySecret?.trim() || "";
  const attempts: AuthAttempt[] = [];

  const baseHeaders = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-SignalHire-Client": "ai-ats",
  };

  // Gina bots historically authenticated with Railway RELAY_SECRET.
  // routes/ats.js also uses requireRelaySecret from auth.js — send common variants.
  if (relaySecret) {
    attempts.push({
      strategy: "x-relay-secret",
      headers: {
        ...baseHeaders,
        "X-Relay-Secret": relaySecret,
      },
    });
    attempts.push({
      strategy: "relay-secret-all-headers",
      headers: {
        ...baseHeaders,
        "X-Relay-Secret": relaySecret,
        "x-relay-secret": relaySecret,
        "X-RELAY-SECRET": relaySecret,
        "Relay-Secret": relaySecret,
        Authorization: `Bearer ${relaySecret}`,
        "X-Api-Key": relaySecret,
      },
    });
    attempts.push({
      strategy: "bearer-relay-secret",
      headers: { ...baseHeaders, Authorization: `Bearer ${relaySecret}` },
    });
  }

  if (cookie) {
    attempts.push({
      strategy: "session-cookie",
      headers: { ...baseHeaders, Cookie: cookie },
    });
  }

  if (password) {
    attempts.push({
      strategy: "bearer-password",
      headers: { ...baseHeaders, Authorization: `Bearer ${password}` },
    });
    attempts.push({
      strategy: "x-app-password",
      headers: { ...baseHeaders, "X-App-Password": password, "X-Password": password },
    });
    attempts.push({
      strategy: "cookie-password",
      headers: {
        ...baseHeaders,
        Cookie: mergeCookies(
          cookie,
          `password=${password}`,
          `app_password=${password}`,
          `auth=${password}`,
          `authenticated=1`,
        ),
      },
    });
  }

  if (apiKey) {
    attempts.push({
      strategy: "api-key",
      headers: {
        ...baseHeaders,
        Authorization: `Bearer ${apiKey}`,
        "X-API-Key": apiKey,
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });
  }

  if (!attempts.length) {
    attempts.push({ strategy: "none", headers: baseHeaders });
  }

  return attempts;
}

function resolveCredentials(credentials: GinaCredentials = {}): Required<
  Pick<GinaCredentials, "baseUrl" | "appPassword" | "apiKey" | "relaySecret">
> {
  return {
    baseUrl: credentials.baseUrl || GINA_DEFAULT_BASE_URL,
    appPassword: (
      credentials.appPassword ||
      process.env.GINA_ATS_APP_PASSWORD ||
      ""
    ).trim(),
    apiKey: (credentials.apiKey || process.env.GINA_ATS_API_KEY || "").trim(),
    relaySecret: (
      credentials.relaySecret ||
      process.env.RELAY_SECRET ||
      process.env.GINA_RELAY_SECRET ||
      ""
    ).trim(),
  };
}

async function requestGina(
  baseUrl: string,
  path: string,
  init: RequestInit,
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    redirect: "manual",
  });
}

async function probeWithAttempts(
  baseUrl: string,
  attempts: AuthAttempt[],
): Promise<{
  authenticated: boolean;
  authStrategy?: string;
  probedRoutes: GinaConnectionTest["probedRoutes"];
  jobsFound?: number;
  workingHeaders?: Record<string, string>;
}> {
  // Only probe routes that prove RELAY_SECRET / app auth — never /health.
  const probePaths = [
    "/ats/pending-actions",
    "/ats/import-candidates",
    "/maria",
    "/chat",
    "/api/conversation",
    "/api/approvals",
  ];

  for (const attempt of attempts) {
    const probedRoutes: GinaConnectionTest["probedRoutes"] = [];
    let authenticated = false;
    let jobsFound: number | undefined;

    for (const path of probePaths) {
      try {
        const response = await requestGina(baseUrl, path, {
          method: "GET",
          headers: attempt.headers,
        });
        const text = await response.text();
        const ok = response.status >= 200 && response.status < 300;
        probedRoutes.push({
          path,
          status: response.status,
          ok,
          snippet: text.slice(0, 120),
        });

        if (ok) {
          authenticated = true;
          if (path === "/ats/jobs" || path === "/ats" || path === "/ats/candidates") {
            try {
              const payload = JSON.parse(text) as
                | { jobs?: unknown[]; candidates?: unknown[]; data?: unknown[] }
                | unknown[];
              if (Array.isArray(payload)) jobsFound = payload.length;
              else if (payload && Array.isArray(payload.jobs)) jobsFound = payload.jobs.length;
              else if (payload && Array.isArray(payload.candidates)) {
                jobsFound = payload.candidates.length;
              } else if (payload && Array.isArray(payload.data)) jobsFound = payload.data.length;
            } catch {
              // ignore parse errors
            }
          }
        }
      } catch {
        probedRoutes.push({ path, status: 0, ok: false, snippet: "network error" });
      }
    }

    if (authenticated) {
      return {
        authenticated: true,
        authStrategy: attempt.strategy,
        probedRoutes,
        jobsFound,
        workingHeaders: attempt.headers,
      };
    }

    // Keep last probe details if nothing authenticated.
    if (attempt === attempts[attempts.length - 1]) {
      return { authenticated: false, probedRoutes, authStrategy: attempt.strategy };
    }
  }

  return { authenticated: false, probedRoutes: [] };
}

/**
 * Live connectivity check against Gina (Lyday Talent Partners ATS on Railway).
 */
export async function testGinaConnection(
  credentials: GinaCredentials = {},
): Promise<GinaConnectionTest> {
  const resolved = resolveCredentials(credentials);
  const baseUrl = normalizeBaseUrl(resolved.baseUrl);
  const { appPassword, apiKey, relaySecret } = resolved;

  let healthOk = false;
  try {
    const health = await fetch(`${baseUrl}/health`, { method: "GET" });
    healthOk = health.ok;
  } catch {
    return {
      ok: false,
      healthOk: false,
      authenticated: false,
      cookieReceived: false,
      baseUrl,
      probedRoutes: [],
      message: `Gina ATS unreachable at ${baseUrl}`,
      nextStep: "Confirm the Railway service is online.",
    };
  }

  let loginStatus: number | undefined;
  let loginLocation: string | undefined;
  let cookie: string | null = null;

  if (appPassword) {
    const login = await loginWithAppPassword(baseUrl, appPassword);
    loginStatus = login.status;
    loginLocation = login.location;
    cookie = login.cookie;

    if (login.location.includes("error=1") && !relaySecret && !apiKey) {
      return {
        ok: false,
        healthOk,
        authenticated: false,
        cookieReceived: false,
        baseUrl,
        loginStatus,
        loginLocation,
        probedRoutes: [],
        message:
          "Gina rejected the browser password (/?error=1). If your bots used RELAY_SECRET, that is the value SignalHire needs — not the web sign-in password.",
        nextStep:
          "In Railway → Gina → Variables, create a new RELAY_SECRET, redeploy Gina, then paste that same secret into SignalHire.",
      };
    }
  }

  if (!appPassword && !apiKey && !relaySecret) {
    return {
      ok: healthOk,
      healthOk,
      authenticated: false,
      cookieReceived: false,
      baseUrl,
      probedRoutes: [],
      message:
        "Gina is online, but SignalHire has no RELAY_SECRET (or password) configured.",
      nextStep:
        "Set a new RELAY_SECRET in Railway Gina variables, redeploy, then enter it here and Save connection.",
    };
  }

  const attempts = buildAuthAttempts({ appPassword, apiKey, relaySecret }, cookie);
  const probe = await probeWithAttempts(baseUrl, attempts);

  if (!probe.authenticated) {
    return {
      ok: false,
      healthOk,
      authenticated: false,
      cookieReceived: Boolean(cookie),
      baseUrl,
      loginStatus,
      loginLocation,
      authStrategy: probe.authStrategy,
      probedRoutes: probe.probedRoutes,
      message: relaySecret
        ? "SignalHire sent RELAY_SECRET, but Gina requireAppAuth still returned 401. Chat bots can work while REST still blocks — update authApp.js to accept X-Relay-Secret / Bearer."
        : "Could not authenticate to Gina routes (/ats, /maria). Bot REST access needs RELAY_SECRET support in requireAppAuth.",
      nextStep:
        "In Gina authApp.js (requireAppAuth), allow requests when X-Relay-Secret or Authorization Bearer matches process.env.RELAY_SECRET, then redeploy Railway. SignalHire talks to /ats and /maria — not Greenhouse-style /api/jobs.",
    };
  }

  return {
    ok: true,
    healthOk,
    authenticated: true,
    cookieReceived: Boolean(cookie),
    baseUrl,
    loginStatus,
    loginLocation,
    authStrategy: probe.authStrategy,
    probedRoutes: probe.probedRoutes,
    jobsFound: probe.jobsFound,
    message:
      probe.jobsFound != null
        ? `Connected to Gina via ${probe.authStrategy}. Found ${probe.jobsFound} job(s).`
        : `Connected to Gina via ${probe.authStrategy}.`,
    nextStep:
      "Connection works. Go to /sourcing, run AI sourcing, and keep “Push top matches to ATS” checked. Update other bots to the same RELAY_SECRET.",
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
  const resolved = resolveCredentials(input.credentials ?? {});
  const baseUrl = normalizeBaseUrl(resolved.baseUrl);
  const { appPassword, apiKey, relaySecret } = resolved;

  if (!appPassword && !apiKey && !relaySecret) {
    return {
      ok: false,
      externalIds: [],
      message:
        "Missing Gina RELAY_SECRET. Set it on /ats (or as RELAY_SECRET in .env.local) and Save connection.",
    };
  }

  let cookie: string | null = null;
  if (appPassword) {
    const login = await loginWithAppPassword(baseUrl, appPassword);
    if (login.location.includes("error=1") && !relaySecret && !apiKey) {
      return {
        ok: false,
        externalIds: [],
        message:
          "Gina rejected the browser password during sync. Use RELAY_SECRET from Railway instead.",
      };
    }
    cookie = login.cookie;
  }

  const normalizedCandidates = input.candidates.map((candidate) => ({
    name: candidate.fullName,
    fullName: candidate.fullName,
    email: candidate.email ?? "",
    phone: "",
    role: candidate.headline ?? "",
    title: candidate.headline ?? "",
    headline: candidate.headline ?? "",
    location: candidate.location ?? "",
    resumeText: candidate.summary ?? "",
    summary: candidate.summary ?? "",
    notes: candidate.summary ?? "",
    skills: candidate.skills,
    experienceYears: candidate.experienceYears,
    linkedProfiles: candidate.platforms,
    profiles: candidate.platforms,
    source: "signalhire",
    tags: ["signalhire", "ai-sourced", ...candidate.platforms.map((p) => p.platformId)],
  }));

  const importPayload = {
    source: "signalhire",
    jobId: input.job.atsExternalId ?? input.job.id,
    jobTitle: input.job.title,
    candidates: normalizedCandidates,
  };

  // Build header sets to try — relay secret first (do not trust GET probe alone).
  const headerAttempts: AuthAttempt[] = [];
  if (relaySecret) {
    headerAttempts.push({
      strategy: "x-relay-secret",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-SignalHire-Client": "ai-ats",
        "X-Relay-Secret": relaySecret,
        "x-relay-secret": relaySecret,
        Authorization: `Bearer ${relaySecret}`,
      },
    });
  }
  if (cookie) {
    headerAttempts.push({
      strategy: "session-cookie",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-SignalHire-Client": "ai-ats",
        Cookie: cookie,
        ...(relaySecret
          ? {
              "X-Relay-Secret": relaySecret,
              "x-relay-secret": relaySecret,
            }
          : {}),
      },
    });
  }
  if (!headerAttempts.length) {
    headerAttempts.push(
      ...buildAuthAttempts({ appPassword, apiKey, relaySecret }, cookie),
    );
  }

  // 1) Preferred: Gina ATS action queue — try each auth header set on POST
  const importErrors: string[] = [];
  for (const attempt of headerAttempts) {
    try {
      const response = await requestGina(baseUrl, "/ats/import-candidates", {
        method: "POST",
        headers: attempt.headers,
        body: JSON.stringify(importPayload),
      });
      const text = await response.text();
      if (response.ok) {
        let externalIds: string[] = [];
        try {
          const json = JSON.parse(text) as { ids?: string[] };
          externalIds = json.ids ?? input.candidates.map((c) => c.id);
        } catch {
          externalIds = input.candidates.map((c) => c.id);
        }
        return {
          ok: true,
          externalIds,
          endpointUsed: "/ats/import-candidates",
          authStrategy: attempt.strategy,
          message: `Queued ${input.candidates.length} named candidate(s) in Gina ats_actions via /ats/import-candidates [${GINA_CLIENT_VERSION}]. Click “Check for actions” in Gina ATS.`,
        };
      }
      if (response.status === 404 || response.status === 405) {
        break;
      }
      let hint = "";
      try {
        const json = JSON.parse(text) as { error?: string; hint?: string };
        if (json.hint) hint = ` hint=${json.hint}`;
        else if (json.error) hint = ` error=${json.error}`;
      } catch {
        // keep raw text
      }
      importErrors.push(
        `${attempt.strategy}->${response.status}${hint}: ${text.slice(0, 120)}`,
      );
    } catch (error) {
      importErrors.push(
        `${attempt.strategy}->network: ${error instanceof Error ? error.message : "error"}`,
      );
    }
  }

  // Hard auth failures on /ats/import-candidates — stop and report (do not hide behind webhook fallback).
  const authBlocked = importErrors.some(
    (line) =>
      line.includes("->401") ||
      line.includes("Not authenticated") ||
      line.includes("Unauthorized") ||
      line.includes("relay_secret_"),
  );
  if (authBlocked) {
    return {
      ok: false,
      externalIds: [],
      authStrategy: headerAttempts[0]?.strategy,
      message: `/ats/import-candidates failed [${GINA_CLIENT_VERSION}]. ${importErrors.slice(0, 4).join(" | ")}. Fix Gina authApp.js hasValidRelaySecret (trim both sides) and ensure Railway RELAY_SECRET matches SignalHire exactly.`,
    };
  }

  // 2) Fallback: post ONE flat candidate at a time (webhook handlers often expect name/email/role, not a bulk wrapper)
  const webhookPaths = ["/webhooks/candidate", "/webhooks/candidates"];
  const createdIds: string[] = [];
  const errors: string[] = [...importErrors];
  const webhookHeaders = headerAttempts[0]?.headers ?? {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const authStrategy = headerAttempts[0]?.strategy;

  for (const candidate of normalizedCandidates) {
    let created = false;
    for (const path of webhookPaths) {
      try {
        const response = await requestGina(baseUrl, path, {
          method: "POST",
          headers: webhookHeaders,
          body: JSON.stringify({
            name: candidate.name,
            fullName: candidate.name,
            email: candidate.email,
            phone: candidate.phone,
            role: candidate.role,
            title: candidate.role,
            resumeText: candidate.resumeText,
            summary: candidate.resumeText,
            source: "signalhire",
            jobTitle: input.job.title,
            jobId: input.job.atsExternalId ?? input.job.id,
          }),
        });
        const text = await response.text();
        if (response.status === 404 || response.status === 405) {
          continue;
        }
        if (!response.ok) {
          errors.push(`${path} (${candidate.name}) → ${response.status}: ${text.slice(0, 100)}`);
          continue;
        }
        let externalId = candidate.name;
        try {
          const json = JSON.parse(text) as { id?: string };
          externalId = json.id ?? candidate.name;
        } catch {
          // keep name
        }
        createdIds.push(externalId);
        created = true;
        break;
      } catch (error) {
        errors.push(
          `${path} (${candidate.name}) → ${error instanceof Error ? error.message : "error"}`,
        );
      }
    }
    if (!created) {
      errors.push(`no webhook accepted ${candidate.name}`);
    }
  }

  if (createdIds.length) {
    return {
      ok: true,
      externalIds: createdIds,
      endpointUsed: "/webhooks/candidate*",
      authStrategy,
      message: `Pushed ${createdIds.length}/${normalizedCandidates.length} named candidate(s) via webhook [${GINA_CLIENT_VERSION}]. Names sent: ${normalizedCandidates
        .map((c) => c.name)
        .slice(0, 5)
        .join(", ")}.`,
    };
  }

  return {
    ok: false,
    externalIds: [],
    authStrategy,
    message: `/ats/import-candidates failed [${GINA_CLIENT_VERSION}]. ${errors.slice(0, 6).join(" | ")}. If hint=relay_secret_mismatch, Railway RELAY_SECRET ≠ SignalHire secret. If hint=relay_secret_header_missing, Gina is not receiving X-Relay-Secret.`,
  };
}
