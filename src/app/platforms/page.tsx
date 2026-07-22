import { CANDIDATE_PLATFORMS } from "@/lib/platforms/catalog";
import { getPlatformCoverageSummary } from "@/lib/platforms/connector";

const categoryLabels: Record<string, string> = {
  professional: "Professional",
  developer: "Developer",
  design: "Design",
  academic: "Academic",
  healthcare: "Healthcare",
  job_board: "Job boards",
  social: "Social",
  community: "Community",
  identity: "Identity & rediscovery",
};

export default function PlatformsPage() {
  const summary = getPlatformCoverageSummary();
  const grouped = CANDIDATE_PLATFORMS.reduce<Record<string, typeof CANDIDATE_PLATFORMS>>(
    (acc, platform) => {
      acc[platform.category] ||= [];
      acc[platform.category].push(platform);
      return acc;
    },
    {},
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10">
      <p className="chip">Coverage map</p>
      <h1 className="display mt-3 text-4xl font-bold text-ink">45+ candidate platforms</h1>
      <p className="mt-3 max-w-3xl text-ink-soft">
        SignalHire catalogs {summary.total} sources with {summary.live} live, {summary.beta} beta,
        and {summary.planned} planned connectors. Each platform uses a shared adapter contract so
        you can enable API credentials without rewriting sourcing workflows.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <div className="panel rounded-2xl p-5">
          <p className="text-sm text-ink-soft">Live</p>
          <p className="display text-3xl font-bold">{summary.live}</p>
        </div>
        <div className="panel rounded-2xl p-5">
          <p className="text-sm text-ink-soft">Beta</p>
          <p className="display text-3xl font-bold">{summary.beta}</p>
        </div>
        <div className="panel rounded-2xl p-5">
          <p className="text-sm text-ink-soft">Planned</p>
          <p className="display text-3xl font-bold">{summary.planned}</p>
        </div>
      </div>

      <div className="mt-10 space-y-8">
        {Object.entries(grouped).map(([category, platforms]) => (
          <section key={category}>
            <h2 className="display text-2xl font-bold text-ink">
              {categoryLabels[category] ?? category}
            </h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {platforms.map((platform) => (
                <article
                  key={platform.id}
                  className="rounded-2xl border border-line bg-white/80 px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-ink">{platform.name}</h3>
                      <p className="mt-1 text-sm text-ink-soft">{platform.description}</p>
                    </div>
                    <span className="chip capitalize">{platform.status}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-ink-soft">
                    {platform.supportsSearch ? <span className="chip">Search</span> : null}
                    {platform.supportsEnrichment ? <span className="chip">Enrichment</span> : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
