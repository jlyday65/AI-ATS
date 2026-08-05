#!/usr/bin/env node
/**
 * Fix: Jobs Tab Edit crashes —
 *   TypeError: undefined is not an object (evaluating 'o.questions.length')
 *
 * Maria/Candidate File upserts omitted job.questions. The Jobs editor assumes
 * questions is always an array.
 *
 * ONE LINE:
 *   node gina-express/frontend/patch-jobs-edit-questions.mjs ~/lyday-gina-backend/gina-backend
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootArg = String(process.argv[2] || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");
if (!rootArg) {
  console.error(
    "Usage: node patch-jobs-edit-questions.mjs ~/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

const root = path.resolve(rootArg);
const ginaDir = fs.existsSync(path.join(root, "frontend", "src", "App.jsx"))
  ? root
  : fs.existsSync(path.join(root, "gina-backend", "frontend", "src", "App.jsx"))
    ? path.join(root, "gina-backend")
    : root;

const appPath = path.join(ginaDir, "frontend", "src", "App.jsx");
if (!fs.existsSync(appPath)) {
  console.error("App.jsx not found:", appPath);
  process.exit(2);
}

function loadEsbuild() {
  try {
    const req = createRequire(
      path.join(ginaDir, "frontend", "node_modules", "esbuild", "package.json"),
    );
    return req("esbuild");
  } catch {
    return null;
  }
}

function canCompile(esbuild, text) {
  if (!esbuild) return { ok: true };
  try {
    esbuild.transformSync(text, {
      loader: "jsx",
      jsx: "automatic",
      logLevel: "silent",
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.errors?.[0]?.text || e.message || e) };
  }
}

let src = fs.readFileSync(appPath, "utf8");
const bak = `${appPath}.bak-jobs-edit-q-${Date.now()}`;
fs.copyFileSync(appPath, bak);

const esbuild = loadEsbuild();
const before = canCompile(esbuild, src);
if (!before.ok) {
  console.error("App.jsx does not compile before patch:", before.error);
  process.exit(2);
}

let changed = 0;

// 1) Defensive questions length checks in Jobs editor / candidate create
const replacements = [
  [/o\.questions\.length/g, "(o.questions || []).length"],
  [/v&&v\.questions\.length/g, "v&&v.questions&&v.questions.length"],
  [/R&&R\.questions\.length/g, "R&&R.questions&&R.questions.length"],
  [
    /v&&v\.questions&&v\.questions\.length\?v\.questions:i/g,
    "v&&v.questions&&v.questions.length?v.questions:i",
  ],
];
for (const [re, to] of replacements) {
  const next = src.replace(re, to);
  if (next !== src) {
    src = next;
    changed += 1;
    console.log("Patched", String(re));
  }
}

// 2) Normalize job when opening Jobs editor: useState(e) → safe clone
if (
  !src.includes("__ginaNormalizeJobForEdit") &&
  /useState\(\s*e\s*\)/.test(src)
) {
  // Prefer the Job editor pattern near "Screening questions for this role"
  const marker = src.indexOf("Screening questions for this role");
  if (marker > 0) {
    const windowStart = Math.max(0, marker - 2500);
    const slice = src.slice(windowStart, marker);
    const m = slice.match(/const\s*\[\s*o\s*,\s*a\s*\]\s*=\s*useState\(\s*e\s*\)/);
    if (m) {
      const at = windowStart + slice.lastIndexOf(m[0]);
      const helper = `
function __ginaNormalizeJobForEdit(job = {}) {
  const q = Array.isArray(job.questions) ? job.questions : [];
  const hc = Number(job.headcount);
  return {
    ...job,
    questions: q,
    headcount: Number.isFinite(hc) && hc > 0 ? hc : 1,
    description: job.description || job.jobDescription || "",
    jobDescription: job.jobDescription || job.description || "",
  };
}
`;
      if (!src.includes("function __ginaNormalizeJobForEdit")) {
        const appAt = src.search(/export\s+default\s+function\s+App\b|function\s+App\b/);
        if (appAt >= 0) {
          src = src.slice(0, appAt) + helper + "\n" + src.slice(appAt);
          changed += 1;
          console.log("Inserted __ginaNormalizeJobForEdit helper");
        }
      }
      src =
        src.slice(0, at) +
        "const [o, a] = useState(() => __ginaNormalizeJobForEdit(e))" +
        src.slice(at + m[0].length);
      changed += 1;
      console.log("Normalized Jobs editor useState(e)");
    }
  }
}

// 3) Update sanitizeGinaJob to always include questions: []
if (src.includes("function sanitizeGinaJob(")) {
  if (!/questions,\s*\n\s*status:/.test(src) && !/questions:\s*questions/.test(src)) {
    // Re-run headcount patch which rewrites sanitize — or inject questions into return
    const start = src.indexOf("function sanitizeGinaJob(");
    const brace = src.indexOf("{", start);
    let depth = 0;
    let end = -1;
    for (let i = brace; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (start >= 0 && end > start) {
      const REPLACEMENT = `function sanitizeGinaJob(job) {
  if (!job || typeof job !== "object") return null;
  const asSkills = (v) => {
    if (Array.isArray(v)) {
      return v
        .map((x) =>
          typeof x === "string"
            ? x
            : x && typeof x === "object"
              ? String(x.name || x.label || x.skill || "")
              : String(x || ""),
        )
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (typeof v === "string" && v.trim()) {
      return v.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    }
    return [];
  };
  const title = String(job.title || job.name || "").trim();
  if (!title) return null;
  const asCount = (v) => {
    const n = Number(String(v ?? "").replace(/[^\\d.]/g, ""));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
  };
  const headcount = asCount(
    job.headcount ??
      job.Headcount ??
      job.sourcedCount ??
      job.candidateCount ??
      job.pipelineCount,
  );
  const openings = asCount(job.openings ?? job.positions);
  const questions = Array.isArray(job.questions)
    ? job.questions
        .map((q) =>
          typeof q === "string"
            ? q
            : q && typeof q === "object"
              ? String(q.text || q.question || q.label || "")
              : String(q || ""),
        )
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const hc = headcount != null ? headcount : 1;
  return {
    id: job.id || \`job_\${Date.now().toString(36)}\`,
    title,
    name: String(job.name || title),
    location: String(job.location || ""),
    description: String(job.description || job.jobDescription || ""),
    jobDescription: String(job.jobDescription || job.description || ""),
    requiredSkills: asSkills(job.requiredSkills),
    preferredSkills: asSkills(job.preferredSkills),
    questions,
    status: String(job.status || "open"),
    source: job.source != null ? String(job.source) : undefined,
    createdAt: job.createdAt || undefined,
    updatedAt: job.updatedAt || undefined,
    createdDate:
      job.createdDate ||
      (job.createdAt ? String(job.createdAt).slice(0, 10) : undefined),
    headcount: hc,
    Headcount: hc,
    sourcedCount: headcount,
    candidateCount: headcount,
    pipelineCount: headcount,
    ...(openings != null ? { openings, positions: openings } : {}),
  };
}`;
      src = src.slice(0, start) + REPLACEMENT + src.slice(end);
      changed += 1;
      console.log("Updated sanitizeGinaJob with questions + headcount defaults");
    }
  } else {
    console.log("sanitizeGinaJob already looks questions-safe");
  }
}

// 4) Boot backfill: ensure every persisted job has questions:[]
if (!src.includes("__ginaJobsQuestionsBackfill")) {
  const jobsState = src.search(
    /const\s*\[\s*jobs\s*,\s*setJobs\s*\]\s*=\s*useState\s*\(/,
  );
  if (jobsState >= 0 && /useEffect/.test(src)) {
    const open = src.indexOf("(", jobsState);
    let depth = 0;
    let end = -1;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    while (end > 0 && (src[end] === ";" || src[end] === "\n" || src[end] === "\r")) {
      if (src[end] === ";") {
        end += 1;
        break;
      }
      end += 1;
    }
    if (end > 0) {
      const inject = `
  useEffect(() => {
    if (typeof window !== "undefined" && window.__ginaJobsQuestionsBackfill) return;
    if (typeof window !== "undefined") window.__ginaJobsQuestionsBackfill = true;
    try {
      setJobs((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        let dirty = false;
        const next = list.map((job) => {
          if (!job || typeof job !== "object") return job;
          const needsQ = !Array.isArray(job.questions);
          const needsHc = !(Number(job.headcount) > 0);
          if (!needsQ && !needsHc) return job;
          dirty = true;
          return {
            ...job,
            questions: Array.isArray(job.questions) ? job.questions : [],
            headcount: needsHc ? 1 : job.headcount,
          };
        });
        return dirty ? next : list;
      });
    } catch (e) { /* ignore */ }
  }, []);
`;
      src = src.slice(0, end) + inject + src.slice(end);
      changed += 1;
      console.log("Injected jobs questions/headcount backfill useEffect");
    }
  }
}

const after = canCompile(esbuild, src);
if (!after.ok) {
  console.error("REFUSING: App.jsx would not compile:", after.error);
  fs.copyFileSync(bak, appPath);
  process.exit(2);
}

fs.writeFileSync(appPath, src, "utf8");
console.log("Wrote", appPath, "changes:", changed);
console.log("Backup:", bak);

// Refresh applyAgentAction (upsert always sets questions:[])
const check = spawnSync(
  process.execPath,
  [path.join(__dirname, "patch-check-for-actions.mjs"), ginaDir],
  { stdio: "inherit" },
);
if (check.status !== 0) {
  console.error("patch-check-for-actions failed:", check.status);
  process.exit(check.status || 2);
}

console.log(`
Next:
  cd ${path.join(ginaDir, "frontend")} && npm run build
  git add -f frontend/dist frontend/src/App.jsx
  git commit -m "Fix Jobs Edit crash: ensure job.questions is an array"
  git push

Then hard-refresh Gina ATS and Edit the job again.
`);
