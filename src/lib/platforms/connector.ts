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

/** Offset the name roster by role so re-sourcing Operations Manager
 *  does not keep re-importing the same Ava Chen / Zoe Ali shortlist. */
function nameIndicesForJob(
  job: JobRequisition,
  personIndex: number,
): { firstIdx: number; lastIdx: number; emailTag: number } {
  const firstBase = hashSeed(`first:${job.title || ""}:${job.id || ""}`);
  const lastBase = hashSeed(`last:${job.title || ""}:${job.id || ""}`);
  return {
    firstIdx: (firstBase + personIndex) % FIRST_NAMES.length,
    lastIdx: (lastBase + personIndex) % LAST_NAMES.length,
    emailTag: (firstBase + lastBase + personIndex) % 100000,
  };
}

function uniqueNameForIndex(
  personIndex: number,
  job?: JobRequisition,
): { first: string; last: string; emailTag: number } {
  // Zip first/last for the default roster; when a job is provided, hash the
  // title separately for first vs last so different roles don't share shortlists.
  if (!job) {
    return {
      first: FIRST_NAMES[personIndex % FIRST_NAMES.length],
      last: LAST_NAMES[personIndex % LAST_NAMES.length],
      emailTag: personIndex,
    };
  }
  const { firstIdx, lastIdx, emailTag } = nameIndicesForJob(job, personIndex);
  return {
    first: FIRST_NAMES[firstIdx],
    last: LAST_NAMES[lastIdx],
    emailTag,
  };
}

const DEMO_SCHOOLS = [
  "Georgia State University",
  "University of Georgia",
  "Georgia Tech",
  "Emory University",
  "University of North Carolina",
  "Clemson University",
  "Auburn University",
  "University of South Carolina",
];

const DEMO_DEGREES = [
  "B.S. Business Administration",
  "B.S. Operations Management",
  "B.A. Management",
  "B.S. Industrial Engineering",
  "B.S. Supply Chain Management",
  "A.S. Applied Science",
];

/** Pick a deterministic school/degree for demo resumes. */
export function buildDemoEducation(seed: number, experienceYears: number) {
  const school = pick(DEMO_SCHOOLS, seed, 3);
  const degree = pick(DEMO_DEGREES, seed, 7);
  const gradYear = new Date().getFullYear() - experienceYears - 1 - (seed % 3);
  return { school, degree, gradYear };
}

/** Build full resume text so Gina can store "resume on file". */
export function buildDemoResumeText(input: {
  fullName: string;
  headline: string;
  location: string;
  email: string;
  skills: string[];
  experienceYears: number;
  jobTitle: string;
  /** Optional seed so education varies per candidate */
  seed?: number;
}): string {
  const skills = input.skills.length ? input.skills.join(", ") : "general operations";
  const seed = input.seed ?? hashSeed(`${input.fullName}:${input.jobTitle}`);
  const { school, degree, gradYear } = buildDemoEducation(seed, input.experienceYears);
  return [
    input.fullName,
    input.headline,
    input.location,
    input.email,
    "",
    "SUMMARY",
    `Experienced ${input.jobTitle} with ${input.experienceYears}+ years supporting operations. Strong overlap on ${skills}.`,
    "",
    "EXPERIENCE",
    `${input.jobTitle} — ${input.location}`,
    `${new Date().getFullYear() - input.experienceYears} – Present`,
    `- Maintained equipment and workflows aligned to ${input.jobTitle} requirements`,
    `- Collaborated across teams; documented procedures and safety checks`,
    `- Skills applied: ${skills}`,
    "",
    "EDUCATION",
    `${degree} — ${school}`,
    `Graduated ${gradYear}`,
    "",
    "SKILLS",
    skills,
  ].join("\n");
}

function synthesizePerson(
  job: JobRequisition,
  personIndex: number,
  platformIds: string[],
): CandidateProfile {
  const seed = hashSeed(`${job.id}:person:${personIndex}`);
  const { first, last, emailTag } = uniqueNameForIndex(personIndex, job);
  const skills = buildSkills(job, seed);
  const years = 3 + (seed % 12);
  // Include job-derived tag in email so roles don't collide on the board.
  const handle = `${first}.${last}.${emailTag}`.toLowerCase();
  const jobLocation = (job.location || "").trim();
  // Bias ~half of demos toward the job city when a specific location is set.
  const location =
    jobLocation && !/remote/i.test(jobLocation) && seed % 2 === 0
      ? jobLocation
      : pick(LOCATIONS, seed, 11);
  const fullName = `${first} ${last}`;
  const headline = buildHeadline(job, skills);
  const summary = `Demo candidate for ${job.title} with overlap on ${skills.join(", ")}. Found across ${platformIds.length} platform(s).`;
  const resumeText = buildDemoResumeText({
    fullName,
    headline,
    location,
    email: `${handle}@example.com`,
    skills,
    experienceYears: years,
    jobTitle: job.title,
    seed,
  });

  return {
    id: `cand_person_${job.id}_${personIndex}`,
    fullName,
    headline,
    location,
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
    summary,
    resumeText,
    sourceSignals: [
      `${platformIds.length} platform hit(s)`,
      `${years}+ years relevant experience`,
      skills[0] ? `Strong signal: ${skills[0]}` : "Generalist fit",
      "Resume on file",
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
