import type { CandidateProfile, JobRequisition, MatchResult } from "@/lib/types";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function skillOverlap(candidateSkills: string[], targetSkills: string[]): string[] {
  const candidateSet = new Set(candidateSkills.map(normalize));
  return targetSkills.filter((skill) => candidateSet.has(normalize(skill)));
}

/**
 * Lightweight ranking engine used until a hosted LLM key is configured.
 * Scores skill overlap, seniority, remote preference, and multi-platform evidence.
 */
export function rankCandidates(
  job: JobRequisition,
  candidates: CandidateProfile[],
): MatchResult[] {
  return candidates
    .map((candidate) => {
      const requiredHits = skillOverlap(candidate.skills, job.requiredSkills);
      const preferredHits = skillOverlap(candidate.skills, job.preferredSkills);
      const reasons: string[] = [];

      let score = 28;
      score += requiredHits.length * 14;
      score += preferredHits.length * 7;

      if (requiredHits.length) {
        reasons.push(`Matches required skills: ${requiredHits.join(", ")}`);
      }
      if (preferredHits.length) {
        reasons.push(`Matches preferred skills: ${preferredHits.join(", ")}`);
      }

      if (job.seniority && candidate.headline?.toLowerCase().includes(job.seniority.toLowerCase())) {
        score += 8;
        reasons.push(`Seniority alignment: ${job.seniority}`);
      }

      if (job.remote && candidate.location?.toLowerCase().includes("remote")) {
        score += 6;
        reasons.push("Open to remote");
      }

      if ((candidate.experienceYears ?? 0) >= 5) {
        score += 5;
        reasons.push(`${candidate.experienceYears}+ years experience`);
      }

      if (candidate.platforms.length > 1) {
        score += 4;
        reasons.push("Multi-platform identity confirmed");
      }

      const resumeBlob = `${candidate.resumeText || ""} ${candidate.summary || ""}`.toLowerCase();
      if (resumeBlob.length > 80) {
        const resumeRequiredHits = job.requiredSkills.filter((skill) =>
          resumeBlob.includes(skill.toLowerCase()),
        );
        const resumePreferredHits = job.preferredSkills.filter((skill) =>
          resumeBlob.includes(skill.toLowerCase()),
        );
        score += resumeRequiredHits.length * 6;
        score += resumePreferredHits.length * 3;
        if (resumeRequiredHits.length) {
          reasons.push(`Resume mentions required: ${resumeRequiredHits.join(", ")}`);
        }
        if (candidate.resumeText && candidate.resumeText.length > 200) {
          reasons.push("Full resume text attached");
        }
      }

      if (!reasons.length) {
        reasons.push("Partial keyword overlap with requisition");
      }

      return {
        candidate,
        score: Math.min(99, score),
        reasons,
        platformHits: candidate.platforms.map((entry) => entry.platformId),
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function buildSourcingBrief(job: JobRequisition): string {
  const skills = [...job.requiredSkills, ...job.preferredSkills].slice(0, 8);
  return [
    `Role: ${job.title}`,
    job.location ? `Location: ${job.location}` : null,
    job.seniority ? `Seniority: ${job.seniority}` : null,
    skills.length ? `Skills focus: ${skills.join(", ")}` : null,
    "Strategy: rediscover ATS talent first, then fan out across developer, professional, and niche platforms.",
    "Note: platform connectors currently return demo profiles for end-to-end testing.",
  ]
    .filter(Boolean)
    .join("\n");
}
