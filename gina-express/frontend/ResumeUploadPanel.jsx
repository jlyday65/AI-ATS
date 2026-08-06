/**
 * Gina ATS UI — Resume upload panel
 *
 * PASTE THIS FUNCTION into App.jsx ABOVE `function JobsView` (same level as
 * ResumeTabPanel). Do NOT paste it inside `{view === "jobs" && (...)}`.
 *
 * Then render:
 *   {view === "resumes" && (
 *     <div style={{ padding: 18, overflowY: "auto", flex: 1 }}>
 *       <ResumeUploadPanel jobs={jobs} onDone={...} />
 *     </div>
 *   )}
 */

function ResumeUploadPanel({ jobs = [], onDone }) {
  const [jobId, setJobId] = useState("");
  const [file, setFile] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const selected = jobs.find((j) => String(j.id) === String(jobId));
      const fd = new FormData();
      if (jobId) fd.append("jobId", jobId);
      if (selected?.title) fd.append("jobTitle", selected.title);
      if (file) fd.append("file", file);
      if (text.trim()) fd.append("resumeText", text.trim());

      const res = await fetch("/resumes/upload", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);

      const name = data.candidate?.name || data.candidate?.full_name || "candidate";
      const role = data.job?.title || data.candidate?.job_title || "";
      setMsg(
        `Saved ${name}` +
          (role ? ` → ${role}` : "") +
          (data.created ? " (created)" : " (updated)")
      );
      setFile(null);
      setText("");
      onDone?.(data);
    } catch (e2) {
      setErr(e2.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif" }}>
        Resume intake
      </h2>
      <p style={{ margin: "0 0 18px", color: "#918D80", fontSize: 13, lineHeight: 1.5 }}>
        Upload a PDF or paste resume text. Gina extracts the profile, matches a job, and saves the full resume on the candidate.
      </p>

      <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
        <label style={labelStyle}>
          Job (optional — leave blank if none)
          <select
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            style={{ ...inputStyle, marginTop: 6 }}
          >
            <option value="">No job selected</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title || "Untitled role"}
              </option>
            ))}
          </select>
        </label>

        <label style={labelStyle}>
          PDF resume
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            style={{ marginTop: 6, fontSize: 12.5 }}
          />
        </label>

        <label style={labelStyle}>
          Or paste resume text
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder="Paste full resume text here…"
            style={{ ...inputStyle, marginTop: 6, fontFamily: "inherit", resize: "vertical" }}
          />
        </label>

        {err && <div style={{ color: "#A34A42", fontSize: 13 }}>{err}</div>}
        {msg && <div style={{ color: "#3F7A4D", fontSize: 13 }}>{msg}</div>}

        <button type="submit" disabled={busy || (!file && !text.trim())} style={primaryBtn}>
          {busy ? "Uploading…" : "Upload resume"}
        </button>
      </form>
    </div>
  );
}
