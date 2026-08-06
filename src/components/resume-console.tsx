"use client";

import { useState } from "react";
import type { JobRequisition, ResumeApplication } from "@/lib/types";

interface IntakeResult {
  job?: { id: string; title: string };
  candidate?: {
    name: string;
    email?: string;
    phone?: string;
    headline?: string;
    skills: string[];
    experienceYears?: number;
    resumeChars: number;
  };
  match?: { score: number; reasons: string[] };
  atsSync?: { ok: boolean; message: string };
  nextStep?: string;
  error?: string;
}

export function ResumeConsole({
  jobs,
  recent,
  relayConfigured,
}: {
  jobs: JobRequisition[];
  recent: ResumeApplication[];
  relayConfigured: boolean;
}) {
  const [jobId, setJobId] = useState(jobs[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [pushToGina, setPushToGina] = useState(true);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<IntakeResult | null>(null);

  async function submit() {
    setPending(true);
    setResult(null);

    const form = new FormData();
    form.set("jobId", jobId);
    form.set("pushToGina", String(pushToGina));
    if (candidateName.trim()) form.set("candidateName", candidateName.trim());
    if (candidateEmail.trim()) form.set("candidateEmail", candidateEmail.trim());
    if (resumeText.trim()) form.set("resumeText", resumeText.trim());
    if (file) form.set("file", file);

    const response = await fetch("/api/resumes/upload", {
      method: "POST",
      body: form,
    });
    const json = await response.json();
    setPending(false);

    if (!response.ok) {
      setResult({ error: json.error ?? "Upload failed" });
      return;
    }
    setResult(json);
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[1.05fr_1.2fr]">
      <section className="panel rounded-2xl p-6">
        <h2 className="display text-2xl font-bold">Upload resume</h2>
        <p className="mt-2 text-sm text-ink-soft">
          Attach a PDF (or paste text) to a job. SignalHire extracts text, scores
          fit, and can push the candidate + resume into Gina.
        </p>

        {!relayConfigured ? (
          <p className="mt-4 text-sm text-ember">
            Save RELAY_SECRET on <a className="underline" href="/ats">/ats</a> before
            pushing to Gina.
          </p>
        ) : null}

        <label className="mt-4 block text-sm">
          <span className="font-medium text-ink">Job / requisition</span>
          <select
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
            value={jobId}
            onChange={(event) => setJobId(event.target.value)}
          >
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title}
                {job.location ? ` — ${job.location}` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-4 block text-sm">
          <span className="font-medium text-ink">Resume PDF</span>
          <input
            type="file"
            accept=".pdf,application/pdf,text/plain"
            className="mt-1 block w-full text-sm"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>

        <label className="mt-4 block text-sm">
          <span className="font-medium text-ink">Or paste resume text</span>
          <textarea
            className="mt-1 min-h-36 w-full rounded-lg border border-line bg-white px-3 py-2"
            value={resumeText}
            onChange={(event) => setResumeText(event.target.value)}
            placeholder="Paste resume text if you don't have a text-based PDF…"
          />
        </label>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-ink">Name override (optional)</span>
            <input
              className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
              value={candidateName}
              onChange={(event) => setCandidateName(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">Email override (optional)</span>
            <input
              className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
              value={candidateEmail}
              onChange={(event) => setCandidateEmail(event.target.value)}
            />
          </label>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={pushToGina}
            onChange={(event) => setPushToGina(event.target.checked)}
          />
          Push candidate + resume text to Gina
        </label>

        <button
          type="button"
          className="btn btn-primary mt-5"
          disabled={
            pending ||
            !jobId ||
            (!file && !resumeText.trim()) ||
            (pushToGina && !relayConfigured)
          }
          onClick={submit}
        >
          {pending ? "Processing…" : "Ingest resume"}
        </button>
      </section>

      <section className="panel rounded-2xl p-6">
        <h2 className="display text-2xl font-bold">Result</h2>
        {!result ? (
          <div className="mt-4 space-y-4">
            <p className="text-ink-soft">
              Upload a resume to see extracted fields, fit score, and Gina push
              status.
            </p>
            {recent.length ? (
              <div>
                <p className="text-sm font-medium text-ink">Recent intakes</p>
                <ul className="mt-2 space-y-2">
                  {recent.slice(0, 5).map((item) => (
                    <li
                      key={item.id}
                      className="rounded-xl border border-line bg-white px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-ink">{item.candidateName}</span>
                      {" · "}
                      {item.matchScore}% fit · {item.fileName}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : result.error ? (
          <p className="mt-4 text-sm text-ember">{result.error}</p>
        ) : (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-ink-soft">
              Job:{" "}
              <span className="font-medium text-ink">{result.job?.title}</span>
            </p>
            <div className="rounded-xl border border-line bg-white px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">{result.candidate?.name}</p>
                  <p className="text-sm text-ink-soft">
                    {result.candidate?.headline || "Headline not detected"}
                  </p>
                  <p className="mt-1 text-sm text-ink-soft">
                    {[result.candidate?.email, result.candidate?.phone]
                      .filter(Boolean)
                      .join(" · ") || "No contact detected"}
                  </p>
                </div>
                <span className="chip">{result.match?.score ?? 0}% fit</span>
              </div>
              <p className="mt-2 text-sm text-ink-soft">
                {(result.candidate?.skills || []).join(" · ") || "No skills detected"}
              </p>
              <p className="mt-2 text-xs text-ink-soft">
                Resume text: {result.candidate?.resumeChars ?? 0} characters
              </p>
            </div>
            {result.match?.reasons?.length ? (
              <p className="text-sm text-ink-soft">{result.match.reasons.join(" · ")}</p>
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
          </div>
        )}
      </section>
    </div>
  );
}
