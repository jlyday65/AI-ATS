import type { CandidateProfile } from "@/lib/types";

const LABEL_BY_ID: Record<string, string> = {
  coresignal: "Coresignal",
  peopledatalabs: "People Data Labs",
  brightdata: "Bright Data",
  talent_pool: "Talent pool",
  demo: "Demo",
  linkedin: "LinkedIn",
  indeed: "Indeed",
  ziprecruiter: "ZipRecruiter",
  glassdoor: "Glassdoor",
  github: "GitHub",
  stackoverflow: "Stack Overflow",
  wellfound: "Wellfound",
  dice: "Dice",
};

/** Human label for a platform / provider id. */
export function platformLabel(id: string): string {
  const key = String(id || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (!key) return "";
  if (LABEL_BY_ID[key]) return LABEL_BY_ID[key];
  // Title-case unknown ids: my_platform → My Platform
  return key
    .split(/[_-]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Which platforms / providers a candidate was sourced from.
 * Prefer provider ids (Coresignal, PDL) then profile platforms (LinkedIn…).
 */
export function sourcedFromForCandidate(
  candidate: CandidateProfile,
  platformHits: string[] = [],
): string[] {
  const ids: string[] = [];
  const push = (raw: string) => {
    const id = String(raw || "")
      .trim()
      .toLowerCase();
    if (!id || ids.includes(id)) return;
    ids.push(id);
  };

  for (const hit of platformHits) push(hit);
  for (const p of candidate.platforms || []) push(p.platformId);

  // Infer provider from sourceSignals when platform list is profile-only
  for (const signal of candidate.sourceSignals || []) {
    const s = String(signal).toLowerCase();
    if (s.includes("coresignal")) push("coresignal");
    if (s.includes("people data labs") || s.includes("peopledatalabs")) {
      push("peopledatalabs");
    }
    if (s.includes("bright data") || s.includes("brightdata")) {
      push("brightdata");
    }
    if (s.includes("talent pool")) push("talent_pool");
    if (s.includes("demo")) push("demo");
  }

  if (!ids.length) push("signalhire");
  return ids.map(platformLabel).filter(Boolean);
}

export function sourcedFromLine(labels: string[]): string {
  return labels.length ? labels.join(" · ") : "SignalHire";
}
