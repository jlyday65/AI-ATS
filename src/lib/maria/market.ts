import {
  jobsMarketProviderStatus,
  researchJobsMarket,
} from "@/lib/jobs-market/service";
import type { JobsMarketProviderId } from "@/lib/jobs-market/types";
import { modeTagForMode, sourceLabelForMode } from "@/lib/settings";
import { getAppSettings } from "@/lib/store";

export interface MariaMarketRequest {
  roleTitle: string;
  location?: string;
  keywords?: string[];
  limit?: number;
  providers?: JobsMarketProviderId[];
  forceDemo?: boolean;
}

export async function runMariaMarketResearch(input: MariaMarketRequest) {
  const roleTitle = (input.roleTitle || "").trim();
  if (!roleTitle) {
    throw new Error("Provide roleTitle for market research");
  }

  const settings = getAppSettings();
  const report = await researchJobsMarket({
    roleTitle,
    location: input.location,
    keywords: input.keywords,
    limit: input.limit ?? 12,
    providers: input.providers,
    forceDemo: input.forceDemo,
  });

  return {
    agent: "maria",
    kind: "job_market_intel",
    atsMode: settings.atsMode,
    source: sourceLabelForMode(settings.atsMode),
    modeTag: modeTagForMode(settings.atsMode),
    providerStatus: jobsMarketProviderStatus(),
    mode: report.mode,
    query: report.query,
    insights: report.insights,
    postingCount: report.postings.length,
    topPostings: report.postings.slice(0, 10).map((posting) => ({
      title: posting.title,
      company: posting.company,
      location: posting.location,
      salaryText: posting.salaryText,
      seniority: posting.seniority,
      source: posting.source,
      url: posting.url,
      postedAt: posting.postedAt,
    })),
    providers: report.providers.map((p) => ({
      provider: p.provider,
      mode: p.mode,
      count: p.postings.length,
      error: p.error,
      latencyMs: p.latencyMs,
    })),
    nextStep:
      "Use insights to refine Candidate File / Maria sourcing brief; run POST /api/maria/source for people shortlists.",
  };
}
