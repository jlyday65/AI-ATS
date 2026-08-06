import { CANDIDATE_PLATFORMS } from "@/lib/platforms/catalog";
import {
  buildDemoEducation,
  buildDemoResumeText,
  buildHeadline,
  searchDemoCandidatePlatforms,
  type PlatformSearchQuery,
} from "@/lib/platforms/demo-search";
import { searchPeopleProviders } from "@/lib/people-sourcing/service";
import type { CandidateProfile } from "@/lib/types";

export type { PlatformSearchQuery };
export {
  buildDemoEducation,
  buildDemoResumeText,
  buildHeadline,
  searchDemoCandidatePlatforms,
};

/**
 * Searches people providers (Coresignal Employee + Bright Data LinkedIn
 * enrichment when keys are set) and falls back to deterministic demo profiles
 * so AI ranking + Gina push can be tested end-to-end without credentials.
 */
export async function searchCandidatePlatforms(
  query: PlatformSearchQuery,
): Promise<CandidateProfile[]> {
  const forceDemo =
    process.env.PEOPLE_SOURCING_FORCE_DEMO === "1" ||
    process.env.PEOPLE_SOURCING_FORCE_DEMO === "true";

  const report = await searchPeopleProviders({
    job: query.job,
    limit: query.limit,
    platforms: query.platforms,
    forceDemo,
  });
  return report.candidates;
}

export function getPlatformCoverageSummary() {
  const total = CANDIDATE_PLATFORMS.length;
  const live = CANDIDATE_PLATFORMS.filter((p) => p.status === "live").length;
  const beta = CANDIDATE_PLATFORMS.filter((p) => p.status === "beta").length;
  const planned = CANDIDATE_PLATFORMS.filter((p) => p.status === "planned").length;
  return { total, live, beta, planned };
}
