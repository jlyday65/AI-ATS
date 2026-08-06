import { randomUUID } from "crypto";
import { buildSourcingBrief, rankCandidates } from "@/lib/ai/matcher";
import { pushCandidatesToAts } from "@/lib/ats/providers";
import { searchCandidatePlatforms } from "@/lib/platforms/connector";
import { listLivePlatforms } from "@/lib/platforms/catalog";
import { hasUsableResumeWithWorkHistory } from "@/lib/resumes/experience";
import {
  talentMatchToProfile,
  talentMatchesForJob,
} from "@/lib/talent-pool/service";
import {
  addSyncEvent,
  getAtsConnection,
  getJob,
  saveSourcingRun,
} from "@/lib/store";
import type { CandidateProfile, MatchResult, SourcingRun } from "@/lib/types";

export interface RunSourcingInput {
  orgId: string;
  jobId: string;
  platformIds?: string[];
  limit?: number;
  /** Skip candidates without resumeText when pushing to ATS */
  resumesRequired?: boolean;
  /**
   * When true (Maria always), drop candidates whose resumeText lacks a mapped
   * EXPERIENCE / work-history block — not optional for Maria shortlists.
   */
  workHistoryRequired?: boolean;
  pushToAtsConnectionId?: string;
  pushTopN?: number;
  /** Include archived Board/Candidate File talent that matches the JD (default true) */
  includeTalentPool?: boolean;
}

function passesResumeGates(
  candidate: CandidateProfile,
  input: Pick<RunSourcingInput, "resumesRequired" | "workHistoryRequired">,
): boolean {
  const text = candidate.resumeText || "";
  if (input.workHistoryRequired || input.resumesRequired) {
    return hasUsableResumeWithWorkHistory(text);
  }
  return true;
}

export interface RunSourcingResult {
  run: SourcingRun;
  brief: string;
  matches: MatchResult[];
  talentPoolHits?: number;
  atsSync?: {
    ok: boolean;
    message: string;
    externalIds: string[];
  };
}

function mergeCandidates(
  primary: CandidateProfile[],
  extras: CandidateProfile[],
): CandidateProfile[] {
  const seen = new Set<string>();
  const out: CandidateProfile[] = [];
  for (const candidate of [...extras, ...primary]) {
    const key = (
      candidate.email?.trim().toLowerCase() ||
      candidate.fullName.trim().toLowerCase()
    );
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

export async function runSourcingAgent(input: RunSourcingInput): Promise<RunSourcingResult> {
  const job = getJob(input.jobId);
  if (!job || job.orgId !== input.orgId) {
    throw new Error("Job not found for organization");
  }

  const platforms =
    input.platformIds?.length
      ? input.platformIds
      : listLivePlatforms().map((platform) => platform.id);

  const startedAt = new Date().toISOString();
  const limit = input.limit ?? 30;
  const liveCandidates = await searchCandidatePlatforms({
    job,
    platforms,
    limit,
  });

  let talentPoolHits = 0;
  let candidates = liveCandidates;
  if (input.includeTalentPool !== false) {
    const poolMatches = talentMatchesForJob(job, Math.min(12, limit));
    talentPoolHits = poolMatches.length;
    const poolProfiles = poolMatches.map((m) =>
      talentMatchToProfile(m, job.id),
    );
    candidates = mergeCandidates(liveCandidates, poolProfiles);
  }

  const ranked = rankCandidates(job, candidates);
  const matches = ranked
    .filter((match) => passesResumeGates(match.candidate, input))
    .slice(0, limit);

  const run: SourcingRun = {
    id: `run_${randomUUID().slice(0, 8)}`,
    orgId: input.orgId,
    jobId: job.id,
    status: "completed",
    platformsQueried: platforms,
    candidateCount: matches.length,
    startedAt,
    completedAt: new Date().toISOString(),
    matches,
  };
  saveSourcingRun(run);

  let atsSync: RunSourcingResult["atsSync"];
  if (input.pushToAtsConnectionId) {
    const connection = getAtsConnection(input.pushToAtsConnectionId);
    if (!connection || connection.orgId !== input.orgId) {
      throw new Error("ATS connection not found for organization");
    }

    const topN = input.pushTopN ?? 5;
    // Dedupe by email/name so Gina does not get Omar Sato × N from old multi-hit lists.
    const seen = new Set<string>();
    const selected = [];
    for (const match of matches) {
      if (selected.length >= topN) break;
      const candidate = match.candidate;
      if (!passesResumeGates(candidate, input)) continue;
      const key = (
        candidate.email?.trim().toLowerCase() ||
        candidate.fullName.trim().toLowerCase()
      );
      if (!key || seen.has(key)) continue;
      seen.add(key);
      selected.push(candidate);
    }
    if (
      (input.resumesRequired || input.workHistoryRequired) &&
      selected.length === 0
    ) {
      throw new Error(
        "No candidates with mapped work history / resume text matched this search. Retry or widen the brief.",
      );
    }
    const result = await pushCandidatesToAts({
      connection,
      job,
      candidates: selected,
    });

    addSyncEvent({
      orgId: input.orgId,
      atsConnectionId: connection.id,
      direction: "push",
      entityType: "candidate",
      payloadSummary: `${selected.length} candidates for ${job.title}`,
      status: result.ok ? "success" : "failed",
    });

    atsSync = {
      ok: result.ok,
      message: result.message,
      externalIds: result.externalIds,
    };
  }

  return {
    run,
    brief: buildSourcingBrief(job),
    matches,
    talentPoolHits,
    atsSync,
  };
}
