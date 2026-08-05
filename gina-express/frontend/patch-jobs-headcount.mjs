#!/usr/bin/env node
/**
 * Preserve / display Maria sourced headcount on Gina Jobs tab rows.
 *
 * Updates sanitizeGinaJob (so React #31 sanitizer does not strip headcount)
 * and refreshes applyAgentAction (writes headcount after Maria sources).
 *
 * ONE LINE:
 *   node gina-express/frontend/patch-jobs-headcount.mjs ~/lyday-gina-backend/gina-backend
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootArg = String(process.argv[2] || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");
if (!rootArg) {
  console.error(
    "Usage: node patch-jobs-headcount.mjs ~/lyday-gina-backend/gina-backend",
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

let src = fs.readFileSync(appPath, "utf8");
const bak = `${appPath}.bak-jobs-hc-${Date.now()}`;
fs.copyFileSync(appPath, bak);

const MARKER = "sourcedCount: headcount";
if (!src.includes(MARKER) && src.includes("function sanitizeGinaJob(")) {
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
    fs.writeFileSync(appPath, src, "utf8");
    console.log("Updated sanitizeGinaJob to preserve headcount");
  } else {
    console.warn("Could not rewrite sanitizeGinaJob block");
  }
} else if (src.includes(MARKER)) {
  console.log("sanitizeGinaJob already preserves headcount");
} else {
  console.warn("sanitizeGinaJob not found — run fix-react-31.mjs first if needed");
}

// Refresh applyAgentAction with headcount sync
const check = spawnSync(
  process.execPath,
  [path.join(__dirname, "patch-check-for-actions.mjs"), ginaDir],
  { stdio: "inherit" },
);
if (check.status !== 0) {
  console.error("patch-check-for-actions failed:", check.status);
  process.exit(check.status || 2);
}

console.log("Backup:", bak);
console.log(`
Next:
  cd ${path.join(ginaDir, "frontend")} && npm run build
  git add -f frontend/dist frontend/src/App.jsx
  git commit -m "Jobs tab: show Maria sourced headcount"
  git push
`);
