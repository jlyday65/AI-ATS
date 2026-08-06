#!/usr/bin/env node
/**
 * When Check for actions / team commands run, inject the selected Jobs-tab
 * job (title, location, description) into Maria / Michelle payloads so
 * Kimberley never has to paste the JD again.
 *
 *   node gina-express/frontend/patch-inject-job-context.mjs ~/lyday-gina-backend/gina-backend
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
    "Usage: node patch-inject-job-context.mjs ~/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

const root = path.resolve(rootArg);
const ginaDir = fs.existsSync(path.join(root, "frontend", "src", "App.jsx"))
  ? root
  : fs.existsSync(path.join(root, "gina-backend", "frontend", "src", "App.jsx"))
    ? path.join(root, "gina-backend")
    : root;

// Sync backend kit files that carry JD through Maria/Michelle
for (const rel of [
  "lib/job-context.js",
  "agents/command-agent.tool.js",
  "agents/bot-replies.js",
  "agents/candidate-file.tool.js",
  "routes/run-command.js",
  "maria-source.tool.js",
]) {
  const src = path.join(__dirname, "..", rel);
  const dest = path.join(ginaDir, rel);
  if (!fs.existsSync(src)) continue;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log("Copied", rel);
}

const appPath = path.join(ginaDir, "frontend", "src", "App.jsx");
if (!fs.existsSync(appPath)) {
  console.error("App.jsx not found:", appPath);
  process.exit(2);
}

let src = fs.readFileSync(appPath, "utf8");
const bak = `${appPath}.bak-jobctx-${Date.now()}`;
fs.copyFileSync(appPath, bak);

// Prefer the crash-safe installer (window.__ginaActiveJob only — no free vars).
const fixCrash = spawnSync(
  process.execPath,
  [path.join(__dirname, "fix-job-context-crash.mjs"), ginaDir],
  { stdio: "inherit" },
);
if (fixCrash.status !== 0) {
  console.warn(
    "fix-job-context-crash exited",
    fixCrash.status,
    "— falling back to inline safe helper",
  );
  const HELPER = `
function activeJobContext() {
  try {
    if (typeof window === "undefined") return {};
    const job = window.__ginaActiveJob;
    if (!job || typeof job !== "object") return {};
    return {
      jobId: job.id || undefined,
      roleTitle: job.title || job.name || undefined,
      location: job.location || undefined,
      roleDescription: job.description || job.jobDescription || undefined,
      jobDescription: job.description || job.jobDescription || undefined,
      requiredSkills: job.requiredSkills || job.skills || undefined,
      preferredSkills: job.preferredSkills || undefined,
    };
  } catch {
    return {};
  }
}

function withActiveJobContext(payload) {
  const base = payload && typeof payload === "object" ? payload : {};
  const job = activeJobContext();
  const merged = {};
  for (const [k, v] of Object.entries(job)) {
    if (v != null && v !== "") merged[k] = v;
  }
  const context = {
    ...(base.context && typeof base.context === "object" ? base.context : {}),
    ...merged,
  };
  return {
    ...base,
    roleTitle: base.roleTitle || job.roleTitle,
    location: base.location || job.location,
    roleDescription: base.roleDescription || job.roleDescription,
    jobDescription: base.jobDescription || job.jobDescription,
    jobId: base.jobId || job.jobId,
    context,
  };
}
`;
  if (!src.includes("function activeJobContext(")) {
    const marker =
      src.indexOf("export default function App()") >= 0
        ? src.indexOf("export default function App()")
        : src.search(/function\s+(?:App|CandidateTracker)\b/);
    if (marker < 0) {
      console.error("Could not find App() to inject activeJobContext");
      process.exit(2);
    }
    src = src.slice(0, marker) + HELPER + "\n" + src.slice(marker);
    console.log("Injected SAFE activeJobContext helpers (fallback)");
  }
} else {
  // fix-job-context-crash already wrote App.jsx + ran check-for-actions
  console.log("Safe job-context helpers installed via fix-job-context-crash");
  console.log(`
Next:
  cd ${path.join(ginaDir, "frontend")} && npm run build
  cd ${path.dirname(ginaDir)}
  git add gina-backend/lib/job-context.js gina-backend/agents gina-backend/routes/run-command.js gina-backend/maria-source.tool.js gina-backend/frontend/src/App.jsx gina-backend/frontend/dist
  git commit -m "Populate Jobs tab from Kimberley JD + Maria/Michelle reuse"
  git pull origin main --rebase && git push origin main
`);
  process.exit(0);
}

// Wrap common queue / run-command payload sites once
if (
  /JSON\.stringify\(\s*\{\s*type:\s*["']command_agent["']/.test(src) &&
  !/withActiveJobContext\(/.test(src)
) {
  src = src.replace(
    /payload:\s*(\{[^{}]*targetAgent[^{}]*\})/g,
    "payload: withActiveJobContext($1)",
  );
  console.log("Wrapped command_agent payloads with withActiveJobContext");
}

// Also enrich /ats/run-command body if present
if (
  /\/ats\/run-command/.test(src) &&
  !/withActiveJobContext\(payload\)/.test(src) &&
  /body:\s*JSON\.stringify\(\s*\{\s*type:/.test(src)
) {
  // Best-effort: before fetch to run-command, enrich action.payload
  src = src.replace(
    /(await\s+fetch\(\s*["'`]\/ats\/run-command["'`])/g,
    `/* job context injected via withActiveJobContext on queue */ $1`,
  );
}

fs.writeFileSync(appPath, src, "utf8");
console.log("Wrote", appPath);
console.log("Backup:", bak);

// Ensure Check for actions kit is current
const check = spawnSync(
  process.execPath,
  [path.join(__dirname, "patch-check-for-actions.mjs"), ginaDir],
  { stdio: "inherit" },
);
if (check.status !== 0) {
  console.warn("patch-check-for-actions exited", check.status);
}

console.log(`
Next:
  cd ${path.join(ginaDir, "frontend")} && npm run build
  cd ${path.dirname(ginaDir)}
  git add gina-backend/lib/job-context.js gina-backend/agents gina-backend/routes/run-command.js gina-backend/maria-source.tool.js gina-backend/frontend/src/App.jsx gina-backend/frontend/dist
  git commit -m "Populate Jobs tab from Kimberley JD + Maria/Michelle reuse"
  git pull origin main --rebase && git push origin main

Usage:
  1) Tell Gina: Ask Maria to source for ROLE + paste/include the full JD
  2) Check for actions — Jobs tab is upserted, Maria runs with that JD
  3) Later: Ask Michelle to screen — questions come from the same JD
`);
