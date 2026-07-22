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

function synthesizeCandidate(
  job: JobRequisition,
  platformId: string,
  index: number,
): CandidateProfile {
  const seed = hashSeed(`${job.id}:${platformId}:${index}`);
  const first = pick(FIRST_NAMES, seed, 1);
  const last = pick(LAST_NAMES, seed, 4);
  const skills = buildSkills(job, seed);
  const years = 2 + (seed % 12);
  const platform = CANDIDATE_PLATFORMS.find((item) => item.id === platformId);
  const handle = `${first}.${last}${seed % 97}`.toLowerCase();

  return {
    id: `cand_${platformId}_${seed.toString(16)}`,
    fullName: `${first} ${last}`,
    headline: `${job.seniority ?? "Experienced"} ${job.title} · ${skills.slice(0, 2).join(" / ")}`,
    location: pick(LOCATIONS, seed, 7),
    email: `${handle}@example.com`,
    skills,
    experienceYears: years,
    platforms: [
      {
        platformId,
        profileUrl: `${platform?.homepage ?? "https://example.com"}/${handle}`,
        handle,
      },
    ],
    summary: `Passive candidate discovered via ${platform?.name ?? platformId} with overlap on ${skills.join(", ")}.`,
    sourceSignals: [
      `${platform?.name ?? platformId} profile match`,
      `${years}+ years relevant experience`,
      skills[0] ? `Strong signal: ${skills[0]}` : "Generalist fit",
    ],
  };
}

/**
 * Searches enabled platforms. Live connectors currently return deterministic
 * demo profiles so teams can wire real API keys per platform later.
 */
export async function searchCandidatePlatforms(
  query: PlatformSearchQuery,
): Promise<CandidateProfile[]> {
  const limit = query.limit ?? 24;
  const enabled = (query.platforms?.length
    ? CANDIDATE_PLATFORMS.filter((platform) => query.platforms?.includes(platform.id))
    : listLivePlatforms()
  ).filter((platform) => platform.supportsSearch && platform.status !== "planned");

  const perPlatform = Math.max(1, Math.ceil(limit / Math.min(enabled.length, 12)));
  const selected = enabled.slice(0, 12);
  const results: CandidateProfile[] = [];

  for (const platform of selected) {
    for (let i = 0; i < perPlatform && results.length < limit; i += 1) {
      results.push(synthesizeCandidate(query.job, platform.id, i));
    }
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
