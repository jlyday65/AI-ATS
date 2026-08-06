import type { JobRequisition } from "@/lib/types";
import type {
  TalentPoolCandidate,
  TalentPoolMatch,
} from "@/lib/talent-pool/types";

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#./]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Score archived talent against a new requisition using title, skills,
 * location, and resume/experience text overlap.
 */
export function scoreTalentAgainstJob(
  job: JobRequisition,
  candidate: TalentPoolCandidate,
): TalentPoolMatch {
  let score = 0;
  const reasons: string[] = [];
  const resumeBlob = [
    candidate.resumeText || "",
    candidate.summary || "",
    candidate.headline || "",
    candidate.archivedFromJobTitle || "",
    candidate.archivedFromJobDescription || "",
  ]
    .join(" ")
    .toLowerCase();

  const jobTitle = (job.title || "").toLowerCase();
  const archivedTitle = (candidate.archivedFromJobTitle || "").toLowerCase();
  if (jobTitle && archivedTitle) {
    if (archivedTitle === jobTitle) {
      score += 40;
      reasons.push(`Prior role exact match: ${candidate.archivedFromJobTitle}`);
    } else if (
      archivedTitle.includes(jobTitle) ||
      jobTitle.includes(archivedTitle)
    ) {
      score += 28;
      reasons.push(`Prior role similar: ${candidate.archivedFromJobTitle}`);
    } else {
      const titleTokens = tokens(job.title);
      const hit = titleTokens.filter(
        (t) =>
          archivedTitle.includes(t) ||
          resumeBlob.includes(t) ||
          (candidate.headline || "").toLowerCase().includes(t),
      );
      if (hit.length) {
        score += Math.min(22, hit.length * 6);
        reasons.push(`Title/experience tokens: ${hit.slice(0, 4).join(", ")}`);
      }
    }
  }

  for (const skill of job.requiredSkills || []) {
    const s = skill.toLowerCase();
    if (!s) continue;
    if (
      candidate.skills.some((c) => c.toLowerCase() === s) ||
      resumeBlob.includes(s)
    ) {
      score += 12;
      reasons.push(`Required skill: ${skill}`);
    }
  }
  for (const skill of job.preferredSkills || []) {
    const s = skill.toLowerCase();
    if (!s) continue;
    if (
      candidate.skills.some((c) => c.toLowerCase() === s) ||
      resumeBlob.includes(s)
    ) {
      score += 5;
      reasons.push(`Preferred skill: ${skill}`);
    }
  }

  const jobCity = (job.location || "").split(",")[0]?.trim().toLowerCase();
  if (
    jobCity &&
    jobCity.length > 2 &&
    !jobCity.includes("remote") &&
    (candidate.location || "").toLowerCase().includes(jobCity)
  ) {
    score += 10;
    reasons.push(`Location match: ${candidate.location}`);
  }

  const descTokens = unique(tokens(job.description || "")).slice(0, 40);
  let descHits = 0;
  for (const t of descTokens) {
    if (resumeBlob.includes(t)) descHits += 1;
  }
  if (descHits >= 3) {
    score += Math.min(24, descHits * 2);
    reasons.push(`Resume/JD overlap (${descHits} terms)`);
  }

  if ((candidate.resumeText || "").trim().length >= 80) {
    score += 4;
    reasons.push("Resume on file");
  }

  return { candidate, score, reasons: unique(reasons).slice(0, 8) };
}

export function matchTalentPool(
  job: JobRequisition,
  pool: TalentPoolCandidate[],
  { limit = 12, minScore = 28 }: { limit?: number; minScore?: number } = {},
): TalentPoolMatch[] {
  return pool
    .map((candidate) => scoreTalentAgainstJob(job, candidate))
    .filter((row) => row.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
