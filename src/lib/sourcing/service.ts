import { randomUUID } from "crypto";
import { buildSourcingBrief, rankCandidates } from "@/lib/ai/matcher";
import { pushCandidatesToAts } from "@/lib/ats/providers";
import { searchCandidatePlatforms } from "@/lib/platforms/connector";
import { listLivePlatforms } from "@/lib/platforms/catalog";
import {
  addSyncEvent,
  getAtsConnection,
  getJob,
  saveSourcingRun,
} from "@/lib/store";
import type { MatchResult, SourcingRun } from "@/lib/types";

export interface RunSourcingInput {
  orgId: string;
  jobId: string;
  platformIds?: string[];
  limit?: number;
  /** Skip candidates without resumeText when pushing to ATS */
  resumesRequired?: boolean;
  pushToAtsConnectionId?: string;
  pushTopN?: number;
}

export interface RunSourcingResult {
  run: SourcingRun;
  brief: string;
  matches: MatchResult[];
  atsSync?: {
    ok: boolean;
    message: string;
    externalIds: string[];
  };
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
  const candidates = await searchCandidatePlatforms({
    job,
    platforms,
    limit: input.limit ?? 30,
  });
  const matches = rankCandidates(job, candidates).slice(0, input.limit ?? 30);

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
      if (
        input.resumesRequired &&
        !(candidate.resumeText && candidate.resumeText.trim().length >= 80)
      ) {
        continue;
      }
      const key = (
        candidate.email?.trim().toLowerCase() ||
        candidate.fullName.trim().toLowerCase()
      );
      if (!key || seen.has(key)) continue;
      seen.add(key);
      selected.push(candidate);
    }
    if (input.resumesRequired && selected.length === 0) {
      throw new Error(
        "No candidates with resume text on file matched this search. Retry or widen the brief.",
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
    atsSync,
  };
}
