import type { JobPosting, JobsMarketQuery } from "@/lib/jobs-market/types";

function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

const COMPANIES = [
  "Northbridge Logistics",
  "Summit Care Systems",
  "Harborline Manufacturing",
  "Atlas Retail Ops",
  "BrightPath Health",
  "Cedar & Co.",
  "Vertex Facilities",
  "Kinetic Warehousing",
];

const LOCATIONS = [
  "Atlanta, GA",
  "Dallas, TX",
  "Remote — US",
  "Chicago, IL",
  "Charlotte, NC",
  "Phoenix, AZ",
];

/**
 * Deterministic competing postings so Maria/Gina can demo market intel
 * without Coresignal or Bright Data credentials.
 */
export function searchDemoJobPostings(query: JobsMarketQuery): JobPosting[] {
  const limit = Math.min(query.limit ?? 12, 20);
  const seed = hashSeed(
    `${query.roleTitle}|${query.location || ""}|${(query.keywords || []).join(",")}`,
  );
  const city =
    (query.location || "").trim() ||
    LOCATIONS[seed % LOCATIONS.length];

  const postings: JobPosting[] = [];
  for (let i = 0; i < limit; i += 1) {
    const company = COMPANIES[(seed + i * 3) % COMPANIES.length];
    const loc =
      i % 3 === 0 ? city : LOCATIONS[(seed + i) % LOCATIONS.length];
    const daysAgo = 1 + ((seed + i) % 21);
    const posted = new Date();
    posted.setDate(posted.getDate() - daysAgo);
    postings.push({
      id: `demo_job_${seed}_${i}`,
      title:
        i % 4 === 0
          ? `Senior ${query.roleTitle}`
          : i % 4 === 1
            ? `${query.roleTitle} II`
            : query.roleTitle,
      company,
      location: loc,
      url: `https://example.com/jobs/demo/${seed}-${i}`,
      description: `Competing ${query.roleTitle} opening at ${company}. Demo market signal (no live Jobs API keys).`,
      employmentType: i % 5 === 0 ? "contract" : "full_time",
      seniority: i % 4 === 0 ? "senior" : "mid",
      salaryText:
        i % 2 === 0
          ? `$${55 + ((seed + i) % 40)}k–$${75 + ((seed + i) % 50)}k`
          : undefined,
      postedAt: posted.toISOString().slice(0, 10),
      source: "demo",
      rawScore: 20 - i,
    });
  }
  return postings;
}
