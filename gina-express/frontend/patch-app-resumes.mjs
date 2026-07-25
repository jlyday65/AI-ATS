#!/usr/bin/env node
/**
 * One-shot patch: wire ResumeUploadPanel into Gina App.jsx on disk.
 *
 * Usage (on your Mac):
 *   node ~/path/to/patch-app-resumes.mjs \
 *     ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 *
 * Or copy this file next to App.jsx and run:
 *   node patch-app-resumes.mjs
 *
 * Verifies with: grep -n "ResumeUploadPanel" App.jsx
 */

import fs from "fs";
import path from "path";

const target =
  process.argv[2] ||
  path.resolve(process.cwd(), "App.jsx");

if (!fs.existsSync(target)) {
  console.error(`File not found: ${target}`);
  console.error("Pass the full path to App.jsx as the first argument.");
  process.exit(1);
}

let src = fs.readFileSync(target, "utf8");

if (src.includes("function ResumeUploadPanel")) {
  console.log("Already patched: ResumeUploadPanel is present.");
  console.log(`File: ${target}`);
  process.exit(0);
}

const panelFn = `
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
      if (!res.ok) throw new Error(data.error || \`Upload failed (\${res.status})\`);

      const name = data.candidate?.name || data.candidate?.full_name || "candidate";
      const role = data.job?.title || data.candidate?.job_title || "";
      setMsg(
        \`Saved \${name}\` +
          (role ? \` → \${role}\` : "") +
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

`;

const resumesView = `
      {view === "resumes" && (
        <div style={{ padding: 18, overflowY: "auto", flex: 1 }}>
          <ResumeUploadPanel
            jobs={jobs}
            onDone={(data) => {
              const c = data?.candidate;
              if (!c) return;
              if (typeof addCandidate === "function") {
                addCandidate({
                  id: c.id,
                  name: c.name || c.full_name || "Candidate",
                  email: c.email || "",
                  phone: c.phone || "",
                  role: c.role || c.job_title || data?.job?.title || "",
                  jobId: c.job_id || data?.job?.id || null,
                  resume_text: c.resume_text || c.resumeText || "",
                  source: c.source || "Resume upload",
                });
              }
              if (typeof setView === "function") setView("board");
            }}
          />
        </div>
      )}
`;

const navItem = `{ key: "resumes", icon: Upload, label: "Resumes" }`;

let changed = [];

// 1) Ensure Upload is imported from lucide-react
const lucideRe = /import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/;
const lucideMatch = src.match(lucideRe);
if (lucideMatch) {
  if (!/\bUpload\b/.test(lucideMatch[1])) {
    src = src.replace(lucideRe, (_full, inner) => {
      const trimmed = inner.trim().replace(/,\s*$/, "");
      return `import { ${trimmed}, Upload } from "lucide-react"`;
    });
    changed.push("added Upload to lucide-react import");
  }
} else {
  console.warn("WARN: no lucide-react import found — add Upload manually if nav icon fails.");
}

// 2) Insert nav item after jobs (or after first nav entry)
if (!/key:\s*["']resumes["']/.test(src)) {
  const jobsNav = /\{\s*key:\s*["']jobs["'][^}]*\}/;
  if (jobsNav.test(src)) {
    src = src.replace(jobsNav, (m) => `${m},\n    ${navItem}`);
    changed.push("added Resumes nav item after jobs");
  } else {
    const boardNav = /\{\s*key:\s*["']board["'][^}]*\}/;
    if (boardNav.test(src)) {
      src = src.replace(boardNav, (m) => `${m},\n    ${navItem}`);
      changed.push("added Resumes nav item after board");
    } else {
      console.error("ERROR: could not find nav items (key: \"jobs\" / \"board\").");
      process.exit(1);
    }
  }
}

// 3) Insert resumes view near jobs view
if (!/view\s*===\s*["']resumes["']/.test(src)) {
  const jobsViewBlock =
    /\{\s*view\s*===\s*["']jobs["']\s*&&\s*\([\s\S]*?<JobsView[\s\S]*?\/>\s*\)\s*\}/;
  if (jobsViewBlock.test(src)) {
    src = src.replace(jobsViewBlock, (m) => `${m}\n${resumesView}`);
    changed.push("added view === \"resumes\" block after jobs view");
  } else {
    // fallback: after first view === "board" block closing — insert before function JobsView instead as sibling render
    const boardView = /\{\s*view\s*===\s*["']board["']\s*&&/;
    if (boardView.test(src)) {
      // insert before the board view line
      src = src.replace(boardView, `${resumesView}\n      {view === "board" &&`);
      changed.push("added view === \"resumes\" block before board view");
    } else {
      console.error('ERROR: could not find {view === "jobs" && (...JobsView...)}');
      process.exit(1);
    }
  }
}

// 4) Insert panel function before JobsView (top-level)
if (!src.includes("function ResumeUploadPanel")) {
  const jobsViewFn = /\nfunction JobsView\b/;
  if (jobsViewFn.test(src)) {
    src = src.replace(jobsViewFn, `\n${panelFn}\nfunction JobsView`);
    changed.push("inserted function ResumeUploadPanel above JobsView");
  } else {
    const resumeTab = /\nfunction ResumeTabPanel\b/;
    if (resumeTab.test(src)) {
      src = src.replace(resumeTab, `\n${panelFn}\nfunction ResumeTabPanel`);
      changed.push("inserted function ResumeUploadPanel above ResumeTabPanel");
    } else {
      console.error("ERROR: could not find function JobsView or ResumeTabPanel.");
      process.exit(1);
    }
  }
}

// backup
const bak = `${target}.bak-resumes-${Date.now()}`;
fs.copyFileSync(target, bak);
fs.writeFileSync(target, src, "utf8");

console.log("Patched OK.");
console.log(`File: ${target}`);
console.log(`Backup: ${bak}`);
console.log("Changes:");
for (const c of changed) console.log(`  - ${c}`);
console.log("");
console.log("Verify:");
console.log(`  grep -n "ResumeUploadPanel" "${target}" | head`);
console.log("");
console.log("Then:");
console.log("  cd ~/lyday-gina-backend/gina-backend");
console.log("  git add frontend/src/App.jsx && git commit -m 'Add Resumes tab with ResumeUploadPanel' && git push");
console.log("  cd frontend && npm run build");
