import Link from "next/link";
import { getPlatformCoverageSummary } from "@/lib/platforms/connector";

export default function HomePage() {
  const coverage = getPlatformCoverageSummary();

  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[70vh] bg-[radial-gradient(circle_at_20%_20%,rgba(15,138,122,0.22),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(196,92,38,0.16),transparent_30%)]"
      />
      <section className="relative mx-auto flex min-h-[78vh] w-full max-w-6xl flex-col justify-center px-5 pb-16 pt-14">
        <p className="animate-rise chip w-fit">B2B AI recruiting layer for modern ATS teams</p>
        <h1 className="display animate-rise-delay mt-6 max-w-4xl text-5xl font-bold leading-[0.95] text-ink md:text-7xl">
          SignalHire
        </h1>
        <p className="animate-rise-delay mt-5 max-w-2xl text-lg text-ink-soft md:text-xl">
          Source passive talent across {coverage.total}+ platforms, rank with AI, and push
          shortlists straight into Gina — the Lyday Talent Partners ATS.
        </p>
        <div className="animate-rise-delay mt-8 flex flex-wrap gap-3">
          <Link href="/dashboard" className="btn btn-primary">
            Enter B2B workspace
          </Link>
          <Link href="/platforms" className="btn btn-secondary">
            View platform coverage
          </Link>
        </div>
        <div className="mt-14 grid max-w-3xl gap-4 text-sm text-ink-soft md:grid-cols-3">
          <div className="panel rounded-xl p-4">
            <p className="display text-3xl font-bold text-ink">{coverage.total}+</p>
            <p className="mt-1">Candidate platforms cataloged</p>
          </div>
          <div className="panel rounded-xl p-4">
            <p className="display text-3xl font-bold text-ink">Gina ATS</p>
            <p className="mt-1">Wired to lyday-gina-backend on Railway</p>
          </div>
          <div className="panel rounded-xl p-4">
            <p className="display text-3xl font-bold text-ink">Multi-tenant</p>
            <p className="mt-1">Org seats, roles, and growth plans</p>
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-white/50">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-16 md:grid-cols-2">
          <div>
            <h2 className="display text-3xl font-bold text-ink">Built as a System of Actions</h2>
            <p className="mt-3 text-ink-soft">
              Keep your ATS as system of record. SignalHire handles research, multi-platform
              sourcing, ranking, and export — including a dedicated connector for the ATS you
              built with Claude.
            </p>
          </div>
          <ul className="space-y-3 text-ink-soft">
            <li className="panel rounded-xl px-4 py-3">
              <span className="font-semibold text-ink">1. Ingest reqs</span> from Claude ATS or
              create them in-app
            </li>
            <li className="panel rounded-xl px-4 py-3">
              <span className="font-semibold text-ink">2. Fan-out search</span> across live + beta
              platforms
            </li>
            <li className="panel rounded-xl px-4 py-3">
              <span className="font-semibold text-ink">3. Rank + sync</span> top matches back to your
              pipeline
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
