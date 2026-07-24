"use client";

import { useMemo, useState } from "react";
import type { AtsConnection, CandidatePlatform, JobRequisition, MatchResult } from "@/lib/types";

interface SourcingResponse {
  brief: string;
  matches: MatchResult[];
  atsSync?: {
    ok: boolean;
    message: string;
    externalIds: string[];
  };
  run: {
    id: string;
    candidateCount: number;
    platformsQueried: string[];
  };
}

export function SourcingConsole({
  jobs,
  connections,
  platforms,
}: {
  jobs: JobRequisition[];
  connections: AtsConnection[];
  platforms: CandidatePlatform[];
}) {
  const [jobId, setJobId] = useState(jobs[0]?.id ?? "");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(
    platforms.slice(0, 12).map((platform) => platform.id),
  );
  const [pushEnabled, setPushEnabled] = useState(true);
  const preferredConnection =
    connections.find((item) => Boolean(item.config.relaySecret?.trim())) ?? connections[0];
  const [connectionId, setConnectionId] = useState(preferredConnection?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SourcingResponse | null>(null);

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === jobId),
    [jobId, jobs],
  );

  function togglePlatform(id: string) {
    setSelectedPlatforms((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function runSourcing() {
    setPending(true);
    setError(null);
    const response = await fetch("/api/sourcing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        platformIds: selectedPlatforms,
        limit: 24,
        pushToAtsConnectionId: pushEnabled ? connectionId : undefined,
        pushTopN: 5,
      }),
    });
    const json = await response.json();
    setPending(false);
    if (!response.ok) {
      setError(json.error ?? "Sourcing failed");
      return;
    }
    setResult(json);
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[1.05fr_1.2fr]">
      <section className="panel rounded-2xl p-6">
        <h2 className="display text-2xl font-bold">Run configuration</h2>

        <label className="mt-4 block text-sm">
          <span className="font-medium text-ink">Job requisition</span>
          <select
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
            value={jobId}
            onChange={(event) => setJobId(event.target.value)}
          >
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title}
              </option>
            ))}
          </select>
        </label>

        {selectedJob ? (
          <p className="mt-3 text-sm text-ink-soft">
            Required: {selectedJob.requiredSkills.join(", ") || "n/a"}
          </p>
        ) : null}

        <div className="mt-5">
          <p className="text-sm font-medium text-ink">
            Platforms ({selectedPlatforms.length} selected)
          </p>
          <div className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
            {platforms.map((platform) => {
              const checked = selectedPlatforms.includes(platform.id);
              return (
                <label
                  key={platform.id}
                  className="flex cursor-pointer items-center justify-between rounded-lg border border-line bg-white px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium text-ink">{platform.name}</span>
                    <span className="ml-2 text-ink-soft">{platform.category}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePlatform(platform.id)}
                  />
                </label>
              );
            })}
          </div>
        </div>

        <label className="mt-5 flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={pushEnabled}
            onChange={(event) => setPushEnabled(event.target.checked)}
          />
          Push top matches to ATS
        </label>

        {pushEnabled ? (
          <label className="mt-3 block text-sm">
            <span className="font-medium text-ink">ATS connection</span>
            <select
              className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
              value={connectionId}
              onChange={(event) => setConnectionId(event.target.value)}
            >
              {connections.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connection.displayName}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <button
          type="button"
          className="btn btn-primary mt-5"
          onClick={runSourcing}
          disabled={pending || !jobId || selectedPlatforms.length === 0}
        >
          {pending ? "Sourcing..." : "Run AI sourcing agent"}
        </button>
        {error ? <p className="mt-3 text-sm text-ember">{error}</p> : null}
      </section>

      <section className="panel rounded-2xl p-6">
        <h2 className="display text-2xl font-bold">Results</h2>
        {!result ? (
          <p className="mt-4 text-ink-soft">
            Run the agent to generate a ranked shortlist from your selected platforms (demo data
            until live connectors are wired).
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-line bg-white px-4 py-3">
              <p className="text-sm font-semibold text-ink">Sourcing brief</p>
              <pre className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">{result.brief}</pre>
              <p className="mt-2 text-xs text-ink-soft">
                Demo mode: names are synthetic. Platform chips show where that demo identity was
                “found.”
              </p>
            </div>
            {result.atsSync ? (
              <div className="rounded-xl border border-line bg-white px-4 py-3 text-sm">
                <p className="font-semibold text-ink">
                  ATS sync {result.atsSync.ok ? "succeeded" : "failed"}
                </p>
                <p className="mt-1 text-ink-soft">{result.atsSync.message}</p>
              </div>
            ) : null}
            <ul className="space-y-3">
              {result.matches.map((match) => (
                <li
                  key={match.candidate.id}
                  className="rounded-xl border border-line bg-white px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-ink">{match.candidate.fullName}</p>
                      <p className="text-sm text-ink-soft">{match.candidate.headline}</p>
                    </div>
                    <span className="chip">{match.score}% fit</span>
                  </div>
                  <p className="mt-2 text-sm text-ink-soft">{match.reasons.join(" · ")}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {match.platformHits.map((platformId) => (
                      <span key={platformId} className="chip">
                        {platformId}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
