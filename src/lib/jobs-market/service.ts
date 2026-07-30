import { searchBrightDataJobs } from "@/lib/jobs-market/brightdata";
import { searchCoresignalJobs } from "@/lib/jobs-market/coresignal";
import { searchDemoJobPostings } from "@/lib/jobs-market/demo";
import { jobsMarketLiveEnabled } from "@/lib/jobs-market/env";
import { buildJobsMarketInsights } from "@/lib/jobs-market/insights";
import type {
  JobPosting,
  JobsMarketProviderId,
  JobsMarketProviderResult,
  JobsMarketQuery,
  JobsMarketReport,
} from "@/lib/jobs-market/types";

function dedupePostings(postings: JobPosting[]): JobPosting[] {
  const seen = new Set<string>();
  const out: JobPosting[] = [];
  for (const posting of postings) {
    const key = [
      posting.title.trim().toLowerCase(),
      (posting.company || "").trim().toLowerCase(),
      (posting.location || "").trim().toLowerCase(),
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(posting);
  }
  return out;
}

async function runProvider(
  id: JobsMarketProviderId,
  query: JobsMarketQuery,
): Promise<JobsMarketProviderResult> {
  if (id === "coresignal") return searchCoresignalJobs(query);
  if (id === "brightdata") return searchBrightDataJobs(query);
  const started = Date.now();
  return {
    provider: "demo",
    mode: "demo",
    postings: searchDemoJobPostings(query),
    latencyMs: Date.now() - started,
  };
}

/**
 * Fan out across Coresignal + Bright Data Jobs APIs.
 * Falls back to deterministic demo postings when keys are missing or live calls fail.
 */
export async function researchJobsMarket(
  input: JobsMarketQuery,
): Promise<JobsMarketReport> {
  const roleTitle = (input.roleTitle || "").trim();
  if (!roleTitle) {
    throw new Error("roleTitle is required for job market research");
  }

  const query: JobsMarketQuery = {
    ...input,
    roleTitle,
    keywords: (input.keywords || []).map((k) => k.trim()).filter(Boolean),
    limit: Math.min(input.limit ?? 12, 40),
  };

  const live = jobsMarketLiveEnabled();
  const requested =
    input.providers?.length
      ? input.providers
      : (["coresignal", "brightdata"] as JobsMarketProviderId[]);

  let providers: JobsMarketProviderResult[] = [];

  if (input.forceDemo || (!live.coresignal && !live.brightdata)) {
    providers = [await runProvider("demo", query)];
  } else {
    const tasks = requested
      .filter((id) => id !== "demo")
      .map((id) => runProvider(id, query));
    providers = await Promise.all(tasks);
    const livePostings = providers.flatMap((p) =>
      p.mode === "live" ? p.postings : [],
    );
    if (!livePostings.length) {
      providers.push(await runProvider("demo", query));
    }
  }

  const postings = dedupePostings(
    providers.flatMap((p) => p.postings),
  ).slice(0, query.limit ?? 12);

  const liveCount = providers.filter((p) => p.mode === "live").length;
  const demoCount = providers.filter((p) => p.mode === "demo").length;
  const mode =
    liveCount && demoCount ? "mixed" : liveCount ? "live" : "demo";

  return {
    query: {
      roleTitle: query.roleTitle,
      location: query.location,
      keywords: query.keywords || [],
    },
    providers,
    postings,
    insights: buildJobsMarketInsights(query, postings),
    mode,
  };
}

export function jobsMarketProviderStatus() {
  const live = jobsMarketLiveEnabled();
  return {
    coresignal: live.coresignal ? "configured" : "missing_api_key",
    brightdata: live.brightdata ? "configured" : "missing_api_key",
    demoFallback: true,
  };
}
