/**
 * Gina ATS UI — Resume upload panel
 *
 * In frontend/App.jsx:
 * 1. Paste this component (or import if you use a bundler that allows it).
 * 2. Render it on Candidates / a new "Resumes" tab, e.g.:
 *      <ResumeUploadPanel jobs={jobs} onDone={loadCandidates} />
 *
 * Expects session cookies already work for authenticated fetch to /resumes/upload.
 */

function ResumeUploadPanel({ jobs = [], onDone }) {
  const [jobId, setJobId] = React.useState(jobs[0]?.id || "");
  const [file, setFile] = React.useState(null);
  const [resumeText, setResumeText] = React.useState("");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!jobId && jobs[0]?.id) setJobId(jobs[0].id);
  }, [jobs, jobId]);

  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError("");
    setResult(null);

    const selected = jobs.find((job) => String(job.id) === String(jobId));
    const form = new FormData();
    if (jobId) form.set("jobId", String(jobId));
    if (selected?.title) form.set("jobTitle", selected.title);
    if (name.trim()) form.set("name", name.trim());
    if (email.trim()) form.set("email", email.trim());
    if (resumeText.trim()) form.set("resumeText", resumeText.trim());
    if (file) form.set("file", file);

    try {
      const response = await fetch("/resumes/upload", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(json.error || `Upload failed (${response.status})`);
        setPending(false);
        return;
      }
      setResult(json);
      if (typeof onDone === "function") onDone(json);
    } catch (err) {
      setError(String(err?.message || err));
    }
    setPending(false);
  }

  return (
    <div className="panel" style={{ padding: 20, marginTop: 16 }}>
      <h2 style={{ margin: 0 }}>Resume upload</h2>
      <p style={{ opacity: 0.8, marginTop: 8 }}>
        Attach a PDF or paste resume text to a job. Gina extracts text, matches by
        email when possible, and stores it on the candidate for Maria to evaluate.
      </p>

      <form onSubmit={submit} style={{ marginTop: 16, display: "grid", gap: 12 }}>
        <label>
          <div>Job</div>
          <select
            value={jobId}
            onChange={(event) => setJobId(event.target.value)}
            style={{ width: "100%", padding: 8 }}
          >
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title || `Job ${job.id}`}
              </option>
            ))}
          </select>
        </label>

        <label>
          <div>Resume PDF</div>
          <input
            type="file"
            accept=".pdf,application/pdf,text/plain"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
        </label>

        <label>
          <div>Or paste resume text</div>
          <textarea
            value={resumeText}
            onChange={(event) => setResumeText(event.target.value)}
            rows={8}
            style={{ width: "100%", padding: 8 }}
            placeholder="Paste resume text for scanned PDFs…"
          />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label>
            <div>Name override (optional)</div>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              style={{ width: "100%", padding: 8 }}
            />
          </label>
          <label>
            <div>Email override (optional)</div>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              style={{ width: "100%", padding: 8 }}
            />
          </label>
        </div>

        <button type="submit" disabled={pending || (!file && !resumeText.trim())}>
          {pending ? "Uploading…" : "Upload resume to ATS"}
        </button>
      </form>

      {error ? (
        <p style={{ color: "#b42318", marginTop: 12 }}>{error}</p>
      ) : null}

      {result?.ok ? (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #ddd" }}>
          <strong>
            {result.created ? "Created" : "Updated"} {result.candidate?.name}
          </strong>
          <div style={{ marginTop: 6, opacity: 0.85 }}>
            {result.candidate?.email || "No email"} ·{" "}
            {result.candidate?.resumeChars || 0} resume characters
          </div>
          <div style={{ marginTop: 6 }}>{result.nextStep}</div>
        </div>
      ) : null}
    </div>
  );
}

// If App.jsx is not using modules, copy the function body above into App.jsx
// and ensure React is in scope. Then render:
//   {tab === "resumes" && (
//     <ResumeUploadPanel jobs={jobs} onDone={() => loadCandidates()} />
//   )}
