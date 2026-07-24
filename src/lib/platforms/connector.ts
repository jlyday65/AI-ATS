import { CANDIDATE_PLATFORMS, listLivePlatforms } from "@/lib/platforms/catalog";
import type { CandidateProfile, JobRequisition } from "@/lib/types";

export interface PlatformSearchQuery {
  job: JobRequisition;
  limit?: number;
  platforms?: string[];
}

const FIRST_NAMES = [
  "Ava",
  "Noah",
  "Mia",
  "Liam",
  "Sofia",
  "Ethan",
  "Zoe",
  "Kai",
  "Nina",
  "Omar",
  "Ivy",
  "Leo",
  "Priya",
  "Mateo",
  "Hana",
  "Jordan",
  "Riley",
  "Samira",
  "Diego",
  "Elena",
  "Marcus",
  "Amara",
  "Theo",
  "Camille",
];

const LAST_NAMES = [
  "Chen",
  "Patel",
  "Nguyen",
  "Garcia",
  "Kim",
  "Brooks",
  "Ali",
  "Singh",
  "Martinez",
  "Wright",
  "Okoye",
  "Ibrahim",
  "Sato",
  "Diaz",
  "Foster",
  "Hayes",
  "Torres",
  "Bennett",
  "Coleman",
  "Reed",
  "Vargas",
  "Keller",
  "Morgan",
  "Blake",
];

const LOCATIONS = [
  "Austin, TX",
  "Remote — US",
  "Seattle, WA",
  "New York, NY",
  "Chicago, IL",
  "Toronto, ON",
  "Berlin, DE",
  "San Francisco, CA",
  "Denver, CO",
  "Atlanta, GA",
];

function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pick<T>(items: T[], seed: number, offset = 0): T {
  return items[(seed + offset) % items.length];
}

function buildSkills(job: JobRequisition, seed: number): string[] {
  const pool = [...job.requiredSkills, ...job.preferredSkills];
  if (pool.length === 0) {
    return ["communication", "collaboration", "problem solving"];
  }
  const count = Math.min(pool.length, 2 + (seed % 3));
  const skills = new Set<string>();
  for (let i = 0; i < count; i += 1) {
    skills.add(pick(pool, seed, i * 3));
  }
  return [...skills];
}

/** Avoid "Senior Senior Full-Stack Engineer" when title already includes seniority. */
export function buildHeadline(job: JobRequisition, skills: string[]): string {
  const title = (job.title || "Professional").trim();
  const seniority = (job.seniority || "").trim();
  const skillBit = skills.slice(0, 2).join(" / ");
  const titleAlreadyHasSeniority =
    Boolean(seniority) && title.toLowerCase().startsWith(seniority.toLowerCase());
  const roleLabel =
    seniority && !titleAlreadyHasSeniority ? `${seniority} ${title}` : title;
  return skillBit ? `${roleLabel} · ${skillBit}` : roleLabel;
}

function uniqueNameForIndex(personIndex: number): { first: string; last: string } {
  // Zip first/last on the same index so top results look like
  // "Ava Chen", "Noah Patel", "Mia Nguyen" — not five Chens or five Avas.
  // usedNames in searchCandidatePlatforms still guards rare wrap collisions.
  const first = FIRST_NAMES[personIndex % FIRST_NAMES.length];
  const last = LAST_NAMES[personIndex % LAST_NAMES.length];
  return { first, last };
}

function synthesizePerson(
  job: JobRequisition,
  personIndex: number,
  platformIds: string[],
): CandidateProfile {
  const seed = hashSeed(`${job.id}:person:${personIndex}`);
  const { first, last } = uniqueNameForIndex(personIndex);
  const skills = buildSkills(job, seed);
  const years = 3 + (seed % 12);
  // Include personIndex in email so even rare name edge-cases stay unique.
  const handle = `${first}.${last}.${personIndex}`.toLowerCase();

  return {
    id: `cand_person_${job.id}_${personIndex}`,
    fullName: `${first} ${last}`,
    headline: buildHeadline(job, skills),
    location: pick(LOCATIONS, seed, 11),
    email: `${handle}@example.com`,
    skills,
    experienceYears: years,
    platforms: platformIds.map((platformId) => {
      const platform = CANDIDATE_PLATFORMS.find((item) => item.id === platformId);
      return {
        platformId,
        profileUrl: `${platform?.homepage ?? "https://example.com"}/${handle}`,
        handle,
      };
    }),
    summary: `Demo candidate for ${job.title} with overlap on ${skills.join(", ")}. Found across ${platformIds.length} platform(s).`,
    sourceSignals: [
      `${platformIds.length} platform hit(s)`,
      `${years}+ years relevant experience`,
      skills[0] ? `Strong signal: ${skills[0]}` : "Generalist fit",
    ],
  };
}

/**
 * Searches enabled platforms.
 *
 * Live API connectors are not wired yet — this returns deterministic demo
 * profiles so the AI ranking + Gina push path can be tested end-to-end.
 * Unique people are generated, then assigned to 1–3 platforms (merged hits).
 */
export async function searchCandidatePlatforms(
  query: PlatformSearchQuery,
): Promise<CandidateProfile[]> {
  const limit = query.limit ?? 24;
  const enabled = (query.platforms?.length
    ? CANDIDATE_PLATFORMS.filter((platform) => query.platforms?.includes(platform.id))
    : listLivePlatforms()
  ).filter((platform) => platform.supportsSearch && platform.status !== "planned");

  const selected = enabled.slice(0, 12);
  if (!selected.length) return [];

  const maxUniqueNames = FIRST_NAMES.length * LAST_NAMES.length;
  const peopleCount = Math.min(limit, 18, maxUniqueNames);
  const results: CandidateProfile[] = [];
  const usedNames = new Set<string>();

  for (let personIndex = 0; personIndex < peopleCount; personIndex += 1) {
    const seed = hashSeed(`${query.job.id}:person:${personIndex}`);
    const platformCount = 1 + (seed % Math.min(3, selected.length));
    const platformIds: string[] = [];
    for (let p = 0; p < platformCount; p += 1) {
      const platform = pick(selected, seed, p * 5);
      if (!platformIds.includes(platform.id)) platformIds.push(platform.id);
    }
    const person = synthesizePerson(query.job, personIndex, platformIds);
    const nameKey = person.fullName.toLowerCase();
    if (usedNames.has(nameKey)) continue;
    usedNames.add(nameKey);
    results.push(person);
  }

  return results;
}

export function getPlatformCoverageSummary() {
  const total = CANDIDATE_PLATFORMS.length;
  const live = CANDIDATE_PLATFORMS.filter((p) => p.status === "live").length;
  const beta = CANDIDATE_PLATFORMS.filter((p) => p.status === "beta").length;
  const planned = CANDIDATE_PLATFORMS.filter((p) => p.status === "planned").length;
  return { total, live, beta, planned };
}
