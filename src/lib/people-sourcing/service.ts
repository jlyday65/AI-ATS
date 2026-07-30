import { searchBrightDataPeople } from "@/lib/people-sourcing/brightdata";
import { searchCoresignalPeople } from "@/lib/people-sourcing/coresignal";
import { peopleLiveEnabled } from "@/lib/people-sourcing/env";
import type {
  PeopleProviderId,
  PeopleProviderResult,
  PeopleSearchQuery,
  PeopleSearchReport,
} from "@/lib/people-sourcing/types";
import { searchDemoCandidatePlatforms } from "@/lib/platforms/demo-search";
import type { CandidateProfile } from "@/lib/types";

function dedupeCandidates(candidates: CandidateProfile[]): CandidateProfile[] {
  const seen = new Set<string>();
  const out: CandidateProfile[] = [];
  for (const candidate of candidates) {
    const key = (
      candidate.email?.trim().toLowerCase() ||
      candidate.fullName.trim().toLowerCase()
    );
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

async function runProvider(
  id: PeopleProviderId,
  query: PeopleSearchQuery,
): Promise<PeopleProviderResult> {
  if (id === "coresignal") return searchCoresignalPeople(query);
  if (id === "brightdata") return searchBrightDataPeople(query);
  const started = Date.now();
  const candidates = await searchDemoCandidatePlatforms({
    job: query.job,
    limit: query.limit,
    platforms: query.platforms,
  });
  return {
    provider: "demo",
    mode: "demo",
    candidates,
    latencyMs: Date.now() - started,
  };
}

/**
 * People / candidate sourcing across Coresignal Employee + Bright Data LinkedIn
 * enrichment, with deterministic demo fallback for end-to-end Maria tests.
 */
export async function searchPeopleProviders(
  input: PeopleSearchQuery,
): Promise<PeopleSearchReport> {
  const live = peopleLiveEnabled();
  const requested =
    input.providers?.length
      ? input.providers
      : (["coresignal", "brightdata"] as PeopleProviderId[]);

  let providers: PeopleProviderResult[] = [];

  if (input.forceDemo || (!live.coresignal && !live.brightdata)) {
    providers = [await runProvider("demo", input)];
  } else {
    providers = await Promise.all(
      requested.filter((id) => id !== "demo").map((id) => runProvider(id, input)),
    );
    const liveCandidates = providers.flatMap((p) =>
      p.mode === "live" ? p.candidates : [],
    );
    if (!liveCandidates.length) {
      providers.push(await runProvider("demo", input));
    }
  }

  const candidates = dedupeCandidates(
    providers.flatMap((p) => p.candidates),
  ).slice(0, input.limit ?? 24);

  const liveCount = providers.filter((p) => p.mode === "live").length;
  const demoCount = providers.filter((p) => p.mode === "demo").length;
  const mode =
    liveCount && demoCount ? "mixed" : liveCount ? "live" : "demo";

  return { providers, candidates, mode };
}

export function peopleProviderStatus() {
  const live = peopleLiveEnabled();
  return {
    coresignal: live.coresignal ? "configured" : "missing_api_key",
    brightdata: live.brightdata ? "configured" : "missing_api_key",
    brightdataSeedUrls: Boolean(
      process.env.BRIGHTDATA_PEOPLE_SEED_URLS?.trim(),
    ),
    demoFallback: true,
  };
}
