import { runSourcingAgent } from "@/lib/sourcing/service";
import {
  sourcedFromForCandidate,
  sourcedFromLine,
} from "@/lib/sourcing/sourced-from";
import { modeTagForMode, sourceLabelForMode } from "@/lib/settings";
import {
  createJob,
  getAppSettings,
  getDemoOrg,
  getJob,
  listAtsConnections,
  listJobs,
} from "@/lib/store";
import type { JobRequisition } from "@/lib/types";

export interface MariaSourceRequest {
  /** Existing SignalHire job id, if known */
  jobId?: string;
  /** Role title from Maria / Gina */
  roleTitle?: string;
  roleDescription?: string;
  requiredSkills?: string[];
  preferredSkills?: string[];
  location?: string;
  seniority?: string;
  platformIds?: string[];
  limit?: number;
  /** Only push candidates that have full resume text on file */
  resumesRequired?: boolean;
  /** Push top matches into Gina via saved ATS connection */
  pushToGina?: boolean;
  pushTopN?: number;
}

function titlesMatch(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Resolve the requisition Maria should source against.
 *
 * roleTitle wins over a mismatched jobId. Gina often sends the board's
 * currently selected job (e.g. Senior Manager) while Kimberley asked Maria
 * to source a different role (e.g. Operations Manager). Using jobId alone
 * produced demo resumes / board cards titled Senior Manager.
 */
export function resolveJob(input: MariaSourceRequest): JobRequisition {
  const org = getDemoOrg();
  const title = (input.roleTitle || "").trim();

  if (input.jobId) {
    const existing = getJob(input.jobId);
    if (!existing || existing.orgId !== org.id) {
      throw new Error(`Unknown jobId: ${input.jobId}`);
    }
    // Only trust jobId when it matches the requested role (or no role given).
    if (!title || titlesMatch(existing.title, title)) {
      return existing;
    }
    // Fall through — match/create by roleTitle.
  }

  if (!title) {
    throw new Error("Provide jobId or roleTitle");
  }

  const match = listJobs(org.id).find((job) => titlesMatch(job.title, title));
  if (match) return match;

  return createJob({
    orgId: org.id,
    title,
    department: "Sourcing",
    location: input.location || "Remote — US",
    employmentType: "full_time",
    description:
      input.roleDescription?.trim() ||
      `Role sourced by Maria for ${title}.`,
    requiredSkills: input.requiredSkills?.length
      ? input.requiredSkills
      : ["communication"],
    preferredSkills: input.preferredSkills ?? [],
    seniority: input.seniority,
    remote: (input.location || "").toLowerCase().includes("remote"),
  });
}

export async function runMariaSourcing(input: MariaSourceRequest) {
  const org = getDemoOrg();
  const job = resolveJob(input);
  const ginaConnection = listAtsConnections(org.id).find(
    (item) =>
      item.provider === "gina_ats" ||
      item.baseUrl.includes("lyday-gina-backend"),
  );

  const pushToGina = input.pushToGina !== false;
  if (pushToGina && !ginaConnection?.config.relaySecret) {
    throw new Error(
      "Gina ATS connection has no RELAY_SECRET saved. Save it on /ats first.",
    );
  }

  const resumesRequired = input.resumesRequired === true;
  const settings = getAppSettings();
  const result = await runSourcingAgent({
    orgId: org.id,
    jobId: job.id,
    platformIds: input.platformIds,
    limit: input.limit ?? 24,
    resumesRequired,
    pushToAtsConnectionId: pushToGina ? ginaConnection?.id : undefined,
    pushTopN: input.pushTopN ?? 5,
  });

  return {
    agent: "maria",
    atsMode: settings.atsMode,
    source: sourceLabelForMode(settings.atsMode),
    modeTag: modeTagForMode(settings.atsMode),
    job: {
      id: job.id,
      title: job.title,
      location: job.location,
    },
    resumesRequired,
    brief: result.brief,
    runId: result.run.id,
    candidateCount: result.matches.length,
    talentPoolHits: result.talentPoolHits ?? 0,
    topCandidates: result.matches.slice(0, input.pushTopN ?? 5).map((match) => {
      const sourcedFrom = sourcedFromForCandidate(
        match.candidate,
        match.platformHits,
      );
      return {
        name: match.candidate.fullName,
        email: match.candidate.email,
        headline: match.candidate.headline,
        location: match.candidate.location,
        resumeChars: (match.candidate.resumeText || "").length,
        score: match.score,
        platforms: match.platformHits,
        sourcedFrom,
        sourcedFromText: sourcedFromLine(sourcedFrom),
        reasons: match.reasons,
        fromTalentPool: match.platformHits.includes("talent_pool"),
      };
    }),
    atsSync: result.atsSync,
    nextStep: result.atsSync?.ok
      ? `In Gina ATS → Agent → Check for actions to import the shortlist (${settings.atsMode} mode · ${sourceLabelForMode(settings.atsMode)}).`
      : "Review atsSync message; fix Gina RELAY_SECRET if push failed.",
  };
}
