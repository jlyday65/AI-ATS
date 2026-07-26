import { runSourcingAgent } from "@/lib/sourcing/service";
import {
  createJob,
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

function resolveJob(input: MariaSourceRequest): JobRequisition {
  const org = getDemoOrg();

  if (input.jobId) {
    const existing = getJob(input.jobId);
    if (!existing || existing.orgId !== org.id) {
      throw new Error(`Unknown jobId: ${input.jobId}`);
    }
    return existing;
  }

  const title = (input.roleTitle || "").trim();
  if (!title) {
    throw new Error("Provide jobId or roleTitle");
  }

  const match = listJobs(org.id).find(
    (job) => job.title.trim().toLowerCase() === title.toLowerCase(),
  );
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
    job: {
      id: job.id,
      title: job.title,
      location: job.location,
    },
    resumesRequired,
    brief: result.brief,
    runId: result.run.id,
    candidateCount: result.matches.length,
    topCandidates: result.matches.slice(0, input.pushTopN ?? 5).map((match) => ({
      name: match.candidate.fullName,
      email: match.candidate.email,
      headline: match.candidate.headline,
      location: match.candidate.location,
      resumeChars: (match.candidate.resumeText || "").length,
      score: match.score,
      platforms: match.platformHits,
      reasons: match.reasons,
    })),
    atsSync: result.atsSync,
    nextStep: result.atsSync?.ok
      ? "In Gina ATS → Agent → Check for actions to import the shortlist."
      : "Review atsSync message; fix Gina RELAY_SECRET if push failed.",
  };
}
