import type { JobRequisition } from "@/lib/types";
import type {
  TalentPoolCandidate,
  TalentPoolMatch,
} from "@/lib/talent-pool/types";

// Common English function/filler words — excluded from token overlap scoring.
// Without this, ANY two job descriptions/resumes share enough generic words
// ("and", "with", "team", "role", "strong", "maintain"...) to rack up a false
// "Resume/JD overlap" score, regardless of actual domain relevance. This was
// confirmed producing real false positives: an archived Warehouse Manager
// candidate scored 38 (above the 28-point minScore threshold) against a
// completely unrelated "CTO / VP IT Infrastructure & Cybersecurity" search,
// purely off generic word overlap plus the near-universal same-city location
// bonus — not any genuine skill or domain match. With this filter, the same
// candidate scores 14 (correctly excluded), while a genuinely relevant
// security-background candidate scores higher than before, since the
// remaining matched terms are now meaningful ones.
const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "have", "will",
  "are", "was", "were", "been", "being", "has", "had", "not", "but",
  "can", "could", "should", "would", "may", "might", "must", "shall",
  "who", "what", "when", "where", "why", "how", "all", "any", "both",
  "each", "few", "more", "most", "other", "some", "such", "only", "own",
  "same", "than", "too", "very", "just", "role", "team", "teams",
  "strong", "also", "across", "overall", "goals", "build", "builds",
  "lead", "leads", "leader", "leaders", "leading", "support",
  "supporting", "ensure", "ensures", "maintain", "maintains",
  "maintained", "high", "top", "new", "our", "your", "their", "its",
  "his", "her", "them", "you", "she", "him", "they", "one", "two",
  "get", "got", "use", "used", "using", "into", "onto", "upon", "over",
  "under", "between", "within", "without", "about", "after", "before",
  "during", "through", "while", "because", "since", "align", "aligns",
  "aligned", "daily", "key", "level", "levels",
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#./]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
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
