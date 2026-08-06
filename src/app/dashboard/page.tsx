import Link from "next/link";
import { getPlatformCoverageSummary } from "@/lib/platforms/connector";
import {
  getDemoOrg,
  listAtsConnections,
  listJobs,
  listMembers,
  listSourcingRuns,
  listSyncEvents,
} from "@/lib/store";

export default function DashboardPage() {
  const org = getDemoOrg();
  const members = listMembers(org.id);
  const jobs = listJobs(org.id);
  const connections = listAtsConnections(org.id);
  const runs = listSourcingRuns(org.id);
  const syncEvents = listSyncEvents(org.id);
  const coverage = getPlatformCoverageSummary();

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="chip">B2B workspace</p>
          <h1 className="display mt-3 text-4xl font-bold text-ink">{org.name}</h1>
          <p className="mt-2 text-ink-soft">
            Plan: {org.plan} · {org.seats} seats · {members.length} active members
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/sourcing" className="btn btn-primary">
            Run AI sourcing
          </Link>
          <Link href="/maria" className="btn btn-secondary">
            Maria
          </Link>
          <Link href="/resumes" className="btn btn-secondary">
            Resumes
          </Link>
          <Link href="/ats" className="btn btn-secondary">
            Manage ATS
          </Link>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-4">
        {[
          { label: "Open jobs", value: String(jobs.filter((j) => j.status === "open").length) },
          { label: "ATS connections", value: String(connections.length) },
          { label: "Platforms live/beta", value: String(coverage.live + coverage.beta) },
          { label: "Sourcing runs", value: String(runs.length) },
        ].map((stat) => (
          <div key={stat.label} className="panel rounded-2xl p-5">
            <p className="text-sm text-ink-soft">{stat.label}</p>
            <p className="display mt-2 text-3xl font-bold text-ink">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="panel rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <h2 className="display text-2xl font-bold">Open requisitions</h2>
            <Link href="/sourcing" className="text-sm font-semibold text-signal">
              Source talent
            </Link>
          </div>
          <ul className="mt-4 space-y-3">
            {jobs.map((job) => (
              <li key={job.id} className="rounded-xl border border-line bg-white px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{job.title}</p>
                    <p className="text-sm text-ink-soft">
                      {job.location ?? "Location TBD"} · {job.requiredSkills.slice(0, 3).join(", ")}
                    </p>
                  </div>
                  <span className="chip capitalize">{job.status}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel rounded-2xl p-6">
          <h2 className="display text-2xl font-bold">ATS sync activity</h2>
          {syncEvents.length === 0 ? (
            <p className="mt-4 text-ink-soft">
              No sync events yet. Run sourcing with Claude ATS push enabled to populate this feed.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {syncEvents.slice(0, 6).map((event) => (
                <li key={event.id} className="rounded-xl border border-line bg-white px-4 py-3">
                  <p className="font-semibold text-ink">{event.payloadSummary}</p>
                  <p className="text-sm text-ink-soft">
                    {event.direction} · {event.status} · {new Date(event.createdAt).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
