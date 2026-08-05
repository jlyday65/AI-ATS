#!/usr/bin/env node
/**
 * Fix ATS crash after Jobs-tab / job-context patch.
 *
 * Safari often reports only a minified stack (Br@…:38:6303) when the real
 * error is "Can't find variable: withActiveJobContext" / selectedJob / jobs.
 *
 * This script:
 *   1) Removes unsafe activeJobContext helpers that close over free vars
 *   2) Unwraps withActiveJobContext(...) call sites
 *   3) Re-installs a SAFE helper that only reads window.__ginaActiveJob
 *   4) Re-applies Check for actions (upsert_job stays; action-time only)
 *   5) Improves the red crash banner so the next error includes the message
 *
 * ONE LINE:
 *   node gina-express/frontend/fix-job-context-crash.mjs ~/lyday-gina-backend/gina-backend
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootArg = String(process.argv[2] || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");
if (!rootArg) {
  console.error(
    "Usage: node fix-job-context-crash.mjs ~/lyday-gina-backend/gina-backend",
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
  if (!esbuild) return { ok: false, error: "esbuild missing" };
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

function braceEnd(src, braceAt) {
  let depth = 0;
  for (let j = braceAt; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") {
      depth--;
      if (depth === 0) return j + 1;
    }
  }
  return -1;
}

/** Remove function activeJobContext / withActiveJobContext blocks. */
function stripJobContextHelpers(src) {
  let out = src;
  for (const name of ["activeJobContext", "withActiveJobContext"]) {
    for (let guard = 0; guard < 6; guard++) {
      const re = new RegExp(`function\\s+${name}\\s*\\(`);
      const m = re.exec(out);
      if (!m) break;
      const start = m.index;
      const braceAt = out.indexOf("{", start);
      if (braceAt < 0) break;
      const end = braceEnd(out, braceAt);
      if (end < 0) break;
      out = out.slice(0, start) + out.slice(end);
      console.log("Removed function", name);
    }
  }
  // Unwrap call sites: withActiveJobContext(X) → X
  let prev;
  do {
    prev = out;
    out = out.replace(/withActiveJobContext\s*\(([\s\S]*?)\)/g, (full, inner) => {
      // Only unwrap when parens are balanced enough for simple payloads
      let depth = 0;
      for (const ch of inner) {
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
      }
      if (depth !== 0) return full;
      return `(${inner})`;
    });
  } while (out !== prev);
  if (out.includes("withActiveJobContext(")) {
    console.warn(
      "Warning: leftover withActiveJobContext( call — manual check needed",
    );
  }
  return out;
}

const SAFE_HELPER = `
/** Safe: never closes over selectedJob/jobs (avoids Safari TDZ / missing var crashes). */
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

const esbuild = loadEsbuild();
let src = fs.readFileSync(appPath, "utf8");
const bak = `${appPath}.bak-fix-jobctx-${Date.now()}`;
fs.copyFileSync(appPath, bak);
console.log("Backup:", bak);

const before = canCompile(esbuild, src);
console.log("Compiles before:", before.ok, before.ok ? "" : before.error);

src = stripJobContextHelpers(src);

// Insert SAFE helper just before App()
if (!src.includes("function activeJobContext(")) {
  const marker =
    src.indexOf("export default function App()") >= 0
      ? src.indexOf("export default function App()")
      : src.search(/function\s+(?:App|CandidateTracker)\b/);
  if (marker < 0) {
    console.error("Could not find App() to inject safe activeJobContext");
    process.exit(2);
  }
  // Never inject above imports
  const importAt = src.search(/^import\s/m);
  if (importAt >= 0 && marker < importAt) {
    console.error("REFUSING: App marker is above imports — file is corrupt");
    process.exit(2);
  }
  src = src.slice(0, marker) + SAFE_HELPER + "\n" + src.slice(marker);
  console.log("Injected SAFE activeJobContext (window.__ginaActiveJob only)");
}

const afterStrip = canCompile(esbuild, src);
if (!afterStrip.ok) {
  console.error("REFUSING: App.jsx would not compile:", afterStrip.error);
  fs.copyFileSync(bak, appPath);
  process.exit(2);
}

fs.writeFileSync(appPath, src, "utf8");
console.log("Wrote", appPath);

// Keep Check for actions / upsert_job current (sets window.__ginaActiveJob in replacement)
const check = spawnSync(
  process.execPath,
  [path.join(__dirname, "patch-check-for-actions.mjs"), ginaDir],
  { stdio: "inherit" },
);
if (check.status !== 0) {
  console.warn("patch-check-for-actions exited", check.status);
}

const banner = spawnSync(
  process.execPath,
  [path.join(__dirname, "patch-show-runtime-errors.mjs"), ginaDir],
  { stdio: "inherit" },
);
if (banner.status !== 0) {
  console.warn("patch-show-runtime-errors exited", banner.status);
}

src = fs.readFileSync(appPath, "utf8");
const final = canCompile(esbuild, src);
if (!final.ok) {
  console.error("REFUSING final compile:", final.error);
  process.exit(2);
}

console.log(`
OK: job-context crash fix applied.

  cd ${path.join(ginaDir, "frontend")} && npm run build
  cd ${path.dirname(ginaDir)}
  git add gina-backend/frontend/src/App.jsx gina-backend/frontend/dist gina-backend/frontend/index.html
  git commit -m "Fix ATS crash: safe Jobs-tab job context helpers"
  git pull origin main --rebase && git push origin main

Then Railway redeploy → hard refresh (Cmd+Shift+R).
Jobs tab upsert still works via Check for actions (upsert_job / Maria JD).
`);
