import type { AtsConnection, AtsProvider, CandidateProfile, JobRequisition } from "@/lib/types";

export interface AtsProviderMeta {
  id: AtsProvider;
  name: string;
  description: string;
  defaultBaseUrl: string;
  authType: "api_key" | "oauth" | "webhook";
  supportsBidirectional: boolean;
}

export const ATS_PROVIDERS: AtsProviderMeta[] = [
  {
    id: "claude_ats",
    name: "Claude ATS (Custom)",
    description:
      "Connect the ATS you built with Claude via REST API keys and webhooks for bidirectional sync.",
    defaultBaseUrl: "https://your-claude-ats.example.com/api/v1",
    authType: "api_key",
    supportsBidirectional: true,
  },
  {
    id: "greenhouse",
    name: "Greenhouse",
    description: "Harvest API candidate and job sync.",
    defaultBaseUrl: "https://harvest.greenhouse.io/v1",
    authType: "api_key",
    supportsBidirectional: true,
  },
  {
    id: "lever",
    name: "Lever",
    description: "Opportunity and posting sync for Lever customers.",
    defaultBaseUrl: "https://api.lever.co/v1",
    authType: "api_key",
    supportsBidirectional: true,
  },
  {
    id: "workday",
    name: "Workday",
    description: "Enterprise recruiting sync for Workday HCM.",
    defaultBaseUrl: "https://wd2-impl.workday.com",
    authType: "oauth",
    supportsBidirectional: true,
  },
  {
    id: "icims",
    name: "iCIMS",
    description: "Person and job sync for iCIMS Talent Cloud.",
    defaultBaseUrl: "https://api.icims.com",
    authType: "oauth",
    supportsBidirectional: true,
  },
  {
    id: "bullhorn",
    name: "Bullhorn",
    description: "Staffing ATS/CRM candidate push.",
    defaultBaseUrl: "https://rest.bullhornstaffing.com/rest-services",
    authType: "oauth",
    supportsBidirectional: false,
  },
  {
    id: "custom_webhook",
    name: "Custom Webhook",
    description: "Generic outbound webhook for any proprietary ATS.",
    defaultBaseUrl: "https://hooks.example.com/ats",
    authType: "webhook",
    supportsBidirectional: false,
  },
];

export interface AtsSyncPayload {
  connection: AtsConnection;
  job: JobRequisition;
  candidates: CandidateProfile[];
}

export interface AtsSyncResult {
  ok: boolean;
  externalIds: string[];
  message: string;
}

/**
 * Pushes ranked candidates into a connected ATS.
 * Claude ATS uses a documented REST contract; other providers are stubbed for credentials wiring.
 */
export async function pushCandidatesToAts(payload: AtsSyncPayload): Promise<AtsSyncResult> {
  const { connection, job, candidates } = payload;

  if (!connection.apiKeyConfigured && connection.provider !== "custom_webhook") {
    return {
      ok: false,
      externalIds: [],
      message: "ATS API key is not configured for this organization.",
    };
  }

  if (connection.provider === "claude_ats") {
    return syncClaudeAts(connection, job, candidates);
  }

  // Deterministic stub for marketplace ATS providers until live credentials are supplied.
  const externalIds = candidates.map(
    (candidate, index) => `${connection.provider}_${job.id}_${index}_${candidate.id.slice(-6)}`,
  );

  return {
    ok: true,
    externalIds,
    message: `Queued ${candidates.length} candidate(s) to ${connection.displayName} for job "${job.title}".`,
  };
}

async function syncClaudeAts(
  connection: AtsConnection,
  job: JobRequisition,
  candidates: CandidateProfile[],
): Promise<AtsSyncResult> {
  const endpoint = `${connection.baseUrl.replace(/\/$/, "")}/candidates/import`;
  const body = {
    source: "ai-ats",
    jobExternalId: job.atsExternalId ?? job.id,
    jobTitle: job.title,
    candidates: candidates.map((candidate) => ({
      fullName: candidate.fullName,
      email: candidate.email,
      headline: candidate.headline,
      location: candidate.location,
      skills: candidate.skills,
      experienceYears: candidate.experienceYears,
      summary: candidate.summary,
      profiles: candidate.platforms,
      tags: ["ai-sourced", ...candidate.platforms.map((p) => p.platformId)],
    })),
  };

  // In local/demo mode we simulate a successful Claude ATS handshake.
  if (
    connection.baseUrl.includes("example.com") ||
    connection.config.demoMode === "true" ||
    process.env.CLAUDE_ATS_DEMO === "1"
  ) {
    return {
      ok: true,
      externalIds: candidates.map((c, i) => `claude_ats_${i}_${c.id.slice(-8)}`),
      message: `Demo sync accepted by Claude ATS contract at ${endpoint}.`,
    };
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${connection.config.apiKey ?? ""}`,
        "X-AI-ATS-Org": connection.orgId,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        ok: false,
        externalIds: [],
        message: `Claude ATS rejected sync (${response.status}): ${text.slice(0, 240)}`,
      };
    }

    const json = (await response.json()) as { ids?: string[] };
    return {
      ok: true,
      externalIds: json.ids ?? [],
      message: `Pushed ${candidates.length} candidates into Claude ATS.`,
    };
  } catch (error) {
    return {
      ok: false,
      externalIds: [],
      message: `Claude ATS unreachable: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }
}

export function getAtsProvider(id: AtsProvider): AtsProviderMeta | undefined {
  return ATS_PROVIDERS.find((provider) => provider.id === id);
}
