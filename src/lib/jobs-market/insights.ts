import type {
  JobPosting,
  JobsMarketInsights,
  JobsMarketQuery,
} from "@/lib/jobs-market/types";

function topCounts(
  values: Array<string | undefined>,
  limit = 5,
): Array<{ key: string; count: number }> {
  const map = new Map<string, number>();
  for (const raw of values) {
    const key = (raw || "").trim();
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

export function buildJobsMarketInsights(
  query: JobsMarketQuery,
  postings: JobPosting[],
): JobsMarketInsights {
  const employers = topCounts(postings.map((p) => p.company)).map((row) => ({
    company: row.key,
    count: row.count,
  }));
  const locations = topCounts(postings.map((p) => p.location)).map((row) => ({
    location: row.key,
    count: row.count,
  }));
  const titleVariants = [
    ...new Set(
      postings
        .map((p) => p.title.trim())
        .filter((title) => title && title.toLowerCase() !== query.roleTitle.toLowerCase()),
    ),
  ].slice(0, 8);
  const salaryHints = [
    ...new Set(
      postings
        .map((p) => p.salaryText?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ].slice(0, 6);

  const locBit = query.location?.trim()
    ? ` near ${query.location.trim()}`
    : "";
  const topCompany = employers[0]?.company;
  const summary =
    postings.length === 0
      ? `No competing ${query.roleTitle} postings found${locBit}.`
      : [
          `Found ${postings.length} competing ${query.roleTitle} posting(s)${locBit}.`,
          topCompany
            ? `Most frequent employer signal: ${topCompany}.`
            : null,
          salaryHints.length
            ? `Salary samples: ${salaryHints.slice(0, 2).join("; ")}.`
            : null,
          titleVariants.length
            ? `Title variants include ${titleVariants.slice(0, 3).join(", ")}.`
            : null,
        ]
          .filter(Boolean)
          .join(" ");

  return {
    competingEmployers: employers,
    commonLocations: locations,
    titleVariants,
    salaryHints,
    summary,
  };
}
