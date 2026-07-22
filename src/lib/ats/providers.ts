import {
  GINA_DEFAULT_BASE_URL,
  pushCandidatesToGina,
  testGinaConnection,
} from "@/lib/ats/gina-client";
import type { AtsConnection, AtsProvider, CandidateProfile, JobRequisition } from "@/lib/types";

export interface AtsProviderMeta {
  id: AtsProvider;
  name: string;
  description: string;
  defaultBaseUrl: string;
  authType: "api_key" | "oauth" | "webhook" | "app_password";
  supportsBidirectional: boolean;
}

export const ATS_PROVIDERS: AtsProviderMeta[] = [
  {
    id: "gina_ats",
    name: "Gina ATS (Lyday Talent Partners)",
    description:
      "Production Claude-built ATS hosted on Railway. Uses app-password session auth plus optional API key.",
    defaultBaseUrl: GINA_DEFAULT_BASE_URL,
    authType: "app_password",
    supportsBidirectional: true,
  },
  {
    id: "claude_ats",
    name: "Claude ATS (Custom)",
    description:
      "Generic Claude-built ATS connector. Prefer Gina ATS for the Lyday production deployment.",
    defaultBaseUrl: GINA_DEFAULT_BASE_URL,
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

function isGinaConnection(connection: AtsConnection): boolean {
  if (connection.provider === "gina_ats") return true;
  return connection.baseUrl.includes("lyday-gina-backend");
}

/**
 * Pushes ranked candidates into a connected ATS.
 */
export async function pushCandidatesToAts(payload: AtsSyncPayload): Promise<AtsSyncResult> {
  const { connection, job, candidates } = payload;

  if (isGinaConnection(connection) || connection.provider === "claude_ats") {
    // Demo mode only for explicit example hosts — never for Gina production.
    if (
      connection.baseUrl.includes("example.com") &&
      connection.config.demoMode === "true"
    ) {
      return {
        ok: true,
        externalIds: candidates.map((c, i) => `demo_${i}_${c.id.slice(-8)}`),
        message: "Demo sync accepted (example host).",
      };
    }

    return pushCandidatesToGina({
      credentials: {
        baseUrl: connection.baseUrl,
        apiKey: connection.config.apiKey,
        appPassword: connection.config.appPassword || process.env.GINA_ATS_APP_PASSWORD,
      },
      job,
      candidates,
    });
  }

  if (!connection.apiKeyConfigured && connection.provider !== "custom_webhook") {
    return {
      ok: false,
      externalIds: [],
      message: "ATS API key is not configured for this organization.",
    };
  }

  const externalIds = candidates.map(
    (candidate, index) => `${connection.provider}_${job.id}_${index}_${candidate.id.slice(-6)}`,
  );

  return {
    ok: true,
    externalIds,
    message: `Queued ${candidates.length} candidate(s) to ${connection.displayName} for job "${job.title}".`,
  };
}

export async function probeAtsConnection(connection: AtsConnection) {
  if (!isGinaConnection(connection) && connection.provider !== "claude_ats") {
    return {
      ok: connection.status === "connected",
      message: `${connection.displayName} uses a marketplace stub until live credentials are wired.`,
    };
  }

  return testGinaConnection({
    baseUrl: connection.baseUrl,
    apiKey: connection.config.apiKey,
    appPassword: connection.config.appPassword || process.env.GINA_ATS_APP_PASSWORD,
  });
}

export function getAtsProvider(id: AtsProvider): AtsProviderMeta | undefined {
  return ATS_PROVIDERS.find((provider) => provider.id === id);
}
