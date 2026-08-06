import { randomUUID } from "crypto";
import {
  listTalentPool,
  upsertTalentCandidates,
} from "@/lib/talent-pool/store";
import { matchTalentPool } from "@/lib/talent-pool/match";
import type {
  TalentPoolArchiveInput,
  TalentPoolCandidate,
  TalentPoolMatch,
} from "@/lib/talent-pool/types";
import type { CandidateProfile, JobRequisition } from "@/lib/types";

function extractSkills(text: string): string[] {
  const blob = text.toLowerCase();
  const catalog = [
    "typescript",
    "javascript",
    "react",
    "node",
    "python",
    "java",
    "sql",
    "aws",
    "azure",
    "hydraulics",
    "welding",
    "forklift",
    "logistics",
    "operations",
    "leadership",
    "excel",
    "sap",
    "maintenance",
    "safety",
    "cdl",
  ];
  return catalog.filter((skill) => blob.includes(skill));
}

export function archiveCandidatesToTalentPool(
  input: TalentPoolArchiveInput,
): { saved: TalentPoolCandidate[]; count: number } {
  const jobTitle = (input.jobTitle || "").trim();
  if (!jobTitle) throw new Error("jobTitle is required to archive talent");
  if (!input.candidates?.length) {
    throw new Error("No candidates provided to archive");
  }

  const now = new Date().toISOString();
  const rows: TalentPoolCandidate[] = [];
  for (const raw of input.candidates) {
    const fullName = String(raw.fullName || raw.name || "").trim();
    if (!fullName) continue;
    const resumeText = String(raw.resumeText || raw.resume || "").trim();
    const headline = String(raw.headline || raw.role || "").trim();
    const skills = [
      ...(raw.skills || []),
      ...extractSkills(`${headline} ${resumeText}`),
    ];
    rows.push({
      id: `tp_${randomUUID().slice(0, 10)}`,
      fullName,
      email: raw.email ? String(raw.email).trim() : undefined,
      phone: raw.phone ? String(raw.phone).trim() : undefined,
      headline: headline || undefined,
      location: raw.location ? String(raw.location).trim() : undefined,
      skills: [...new Set(skills.map((s) => s.trim()).filter(Boolean))],
      resumeText: resumeText || undefined,
      summary: raw.summary ? String(raw.summary).trim() : undefined,
      source: raw.source ? String(raw.source) : "job_save_export",
      stage: raw.stage ? String(raw.stage) : undefined,
      archivedFromJobTitle: jobTitle,
      archivedFromJobDescription: input.jobDescription?.trim() || undefined,
      archivedAt: now,
      tags: [
        "archived",
        input.label || "job_save_export",
        input.clientName ? `client:${input.clientName}` : "",
      ].filter(Boolean),
    });
  }

  const saved = upsertTalentCandidates(rows);
  return { saved, count: saved.length };
}

export function talentMatchesForJob(
  job: JobRequisition,
  limit = 12,
): TalentPoolMatch[] {
  return matchTalentPool(job, listTalentPool(), { limit, minScore: 28 });
}

/** Convert talent-pool hits into CandidateProfile for Maria ranking/push. */
export function talentMatchToProfile(
  match: TalentPoolMatch,
  jobId: string,
): CandidateProfile {
  const c = match.candidate;
  const handle = c.fullName.toLowerCase().replace(/\s+/g, ".");
  return {
    id: `cand_talent_${jobId}_${c.id}`,
    fullName: c.fullName,
    headline: c.headline || c.archivedFromJobTitle,
    location: c.location,
    email: c.email,
    phone: c.phone,
    skills: c.skills,
    platforms: [
      {
        platformId: "talent_pool",
        profileUrl: `https://signalhire.local/talent-pool/${c.id}`,
        handle,
      },
    ],
    summary:
      c.summary ||
      `Archived talent (prior: ${c.archivedFromJobTitle || "saved role"}). Match score ${match.score}.`,
    resumeText:
      c.resumeText ||
      [
        c.fullName,
        c.headline || "",
        c.location || "",
        "",
        "SUMMARY",
        `Previously sourced for ${c.archivedFromJobTitle || "a prior role"}.`,
        "",
        "SKILLS",
        c.skills.join(", ") || "see archive",
      ].join("\n"),
    sourceSignals: [
      "Talent pool (saved Board / Candidate File)",
      c.archivedFromJobTitle
        ? `Archived from: ${c.archivedFromJobTitle}`
        : "Archived candidate",
      ...match.reasons.slice(0, 3),
    ],
  };
}
