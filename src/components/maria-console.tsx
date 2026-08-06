"use client";

import { useState } from "react";
import type { JobRequisition } from "@/lib/types";

interface MariaSourceResult {
  job?: { id: string; title: string };
  brief?: string;
  candidateCount?: number;
  topCandidates?: Array<{
    name: string;
    email?: string;
    headline?: string;
    score: number;
    platforms: string[];
    reasons: string[];
  }>;
  atsSync?: { ok: boolean; message: string };
  nextStep?: string;
  error?: string;
}

export function MariaConsole({
  jobs,
  relayConfigured,
}: {
  jobs: JobRequisition[];
  relayConfigured: boolean;
}) {
  const [jobId, setJobId] = useState(jobs[0]?.id ?? "");
  const [roleTitle, setRoleTitle] = useState(jobs[0]?.title ?? "");
  const [pushToGina, setPushToGina] = useState(true);
  const [pushTopN, setPushTopN] = useState(5);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<MariaSourceResult | null>(null);

  async function runMariaSource() {
    setPending(true);
    setResult(null);

    const selected = jobs.find((job) => job.id === jobId);
    const response = await fetch("/api/maria/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: selected?.id || jobId || undefined,
        roleTitle: roleTitle || selected?.title,
        roleDescription: selected?.description,
        requiredSkills: selected?.requiredSkills,
        preferredSkills: selected?.preferredSkills,
        location: selected?.location,
        seniority: selected?.seniority,
        pushToGina,
        pushTopN,
      }),
    });
    const json = await response.json();
    setPending(false);

    if (!response.ok) {
      setResult({ error: json.error ?? "Maria sourcing failed" });
      return;
    }

    setResult(json);
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[1.05fr_1.2fr]">
      <section className="panel rounded-2xl p-6">
        <h2 className="display text-2xl font-bold">Run as Maria</h2>
        <p className="mt-2 text-sm text-ink-soft">
          Simulates Maria asking SignalHire to source a role and push the top
          matches into Gina.
        </p>

        {!relayConfigured ? (
          <p className="mt-4 text-sm text-ember">
            Save RELAY_SECRET on <a className="underline" href="/ats">/ats</a>{" "}
            before Maria can push to Gina.
          </p>
        ) : null}

        <label className="mt-4 block text-sm">
          <span className="font-medium text-ink">Job requisition</span>
          <select
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
            value={jobId}
            onChange={(event) => {
              setJobId(event.target.value);
              const job = jobs.find((item) => item.id === event.target.value);
              if (job) setRoleTitle(job.title);
            }}
          >
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-4 block text-sm">
          <span className="font-medium text-ink">Role title (Maria payload)</span>
          <input
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
            value={roleTitle}
            onChange={(event) => setRoleTitle(event.target.value)}
          />
        </label>

        <label className="mt-4 flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={pushToGina}
            onChange={(event) => setPushToGina(event.target.checked)}
          />
          Push top matches to Gina
        </label>

        <label className="mt-3 block text-sm">
          <span className="font-medium text-ink">Push top N</span>
          <input
            type="number"
            min={1}
            max={20}
            className="mt-1 w-24 rounded-lg border border-line bg-white px-3 py-2"
            value={pushTopN}
            onChange={(event) => setPushTopN(Number(event.target.value) || 5)}
          />
        </label>

        <button
          type="button"
          className="btn btn-primary mt-5"
          disabled={pending || (!jobId && !roleTitle.trim()) || (pushToGina && !relayConfigured)}
          onClick={runMariaSource}
        >
          {pending ? "Maria is sourcing..." : "Ask Maria to source"}
        </button>
      </section>

      <section className="panel rounded-2xl p-6">
        <h2 className="display text-2xl font-bold">Maria result</h2>
        {!result ? (
          <p className="mt-4 text-ink-soft">
            Run Maria to see the shortlist and Gina push status.
          </p>
        ) : result.error ? (
          <p className="mt-4 text-sm text-ember">{result.error}</p>
        ) : (
          <div className="mt-4 space-y-4">
            {result.job ? (
              <p className="text-sm text-ink-soft">
                Job: <span className="font-medium text-ink">{result.job.title}</span>
              </p>
            ) : null}
            {result.brief ? (
              <pre className="whitespace-pre-wrap rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-soft">
                {result.brief}
              </pre>
            ) : null}
            {result.atsSync ? (
              <p className="text-sm text-ink-soft">
                ATS sync {result.atsSync.ok ? "succeeded" : "failed"}:{" "}
                {result.atsSync.message}
              </p>
            ) : null}
            {result.nextStep ? (
              <p className="text-sm text-signal-deep">{result.nextStep}</p>
            ) : null}
            <p className="text-sm text-ink-soft">
              {result.candidateCount ?? 0} demo profiles ranked
            </p>
            <ul className="space-y-3">
              {(result.topCandidates || []).map((candidate) => (
                <li
                  key={`${candidate.name}-${candidate.email ?? ""}-${candidate.score}`}
                  className="rounded-xl border border-line bg-white px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-ink">{candidate.name}</p>
                      <p className="text-sm text-ink-soft">{candidate.headline}</p>
                    </div>
                    <span className="chip">{candidate.score}% fit</span>
                  </div>
                  <p className="mt-2 text-sm text-ink-soft">
                    {candidate.reasons.join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
