#!/usr/bin/env node
/**
 * Fix Gina ATS white screen (blank page after a bad App.jsx patch).
 *
 * DEFAULT = bare restore (safe):
 *   - strip helpers incorrectly injected above import
 *   - nuclear-restore if App.jsx does not compile
 *   - re-apply Check for actions + beginCandidateImportSession repair ONLY
 *   - does NOT re-apply Education / Board "From:" patches (those caused
 *     runtime ReferenceErrors → white screen even when esbuild passed)
 *
 * Optional:
 *   --full   also re-apply Education + Board sourced-from (after UI is up)
 *
 * ONE LINE:
 *   node gina-express/frontend/fix-ats-white-screen.mjs ~/lyday-gina-backend/gina-backend
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const full = args.includes("--full");
const rootArg = String(args.find((a) => !a.startsWith("--")) || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");

if (!rootArg) {
  console.error(
    "Usage: node fix-ats-white-screen.mjs ~/lyday-gina-backend/gina-backend [--full]",
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
  if (!esbuild) {
    return { ok: false, error: "esbuild missing — run npm install in frontend" };
  }
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

function run(script, scriptArgs = [ginaDir]) {
  const fullPath = path.join(__dirname, script);
  if (!fs.existsSync(fullPath)) {
    console.warn("Skip missing", script);
    return 0;
  }
  console.log("\n→", script);
  const r = spawnSync(process.execPath, [fullPath, ...scriptArgs], {
    stdio: "inherit",
  });
  return r.status ?? 2;
}

/** Remove runtime-crash Board/Education call sites (keep App compiling). */
function stripRiskyUiInjections(src) {
  let out = src;
  // Board "From:" adjacent JSX after {c.name} / {candidate.name}
  out = out.replace(
    /(\{(?:c|candidate)\.name\})\{(?:typeof candidateSourcedFromText[^}]+\}[^]*?null\}|candidateSourcedFromText\([^)]*\)\s*\?\s*\([^]*?null\})/g,
    "$1",
  );
  // Softer: any From: candidateSourcedFromText block glued after name
  out = out.replace(
    /\{c\.name\}\{[^;]*?candidateSourcedFromText\(c\)[^;]*?null\}/g,
    "{c.name}",
  );
  out = out.replace(
    /\{candidate\.name\}\{[^;]*?candidateSourcedFromText\(candidate\)[^;]*?null\}/g,
    "{candidate.name}",
  );
  // Education detail block
  out = out.replace(
    /\{\s*(?:typeof candidateEducationText === "function" &&\s*)?candidateEducationText\(active\)\s*\?[\s\S]*?:\s*null\s*\}/g,
    "",
  );
  // Bare dangerous calls that white-screen Check for actions / render
  out = out.replace(
    /^\s*beginCandidateImportSession\s*\(\s*\)\s*;?\s*$/gm,
    "  /* beginCandidateImportSession skipped — restored bare */",
  );
  return out;
}

const esbuild = loadEsbuild();
let src = fs.readFileSync(appPath, "utf8");
let compile = canCompile(esbuild, src);
console.log(
  "Live App.jsx compiles:",
  compile.ok,
  compile.ok ? "" : compile.error,
);
console.log("Mode:", full ? "full (re-apply UI patches)" : "bare (recommended)");

// Strip helpers sitting above import lines
const importAt = src.search(/^import\s/m);
if (importAt > 0) {
  const head = src.slice(0, importAt);
  if (
    /function\s+candidateSourcedFromText\b|function\s+candidateEducationText\b|function\s+beginCandidateImportSession\b|function\s+candidateIdentityKey\b/.test(
      head,
    )
  ) {
    const bak = `${appPath}.bak-white-head-${Date.now()}`;
    fs.copyFileSync(appPath, bak);
    src = src.slice(importAt);
    fs.writeFileSync(appPath, src, "utf8");
    console.log("Stripped helper(s) injected above imports");
    console.log("Backup:", bak);
    compile = canCompile(esbuild, src);
  }
}

// Always strip risky UI injections first (runtime white screens)
{
  const bak = `${appPath}.bak-strip-ui-${Date.now()}`;
  const stripped = stripRiskyUiInjections(src);
  if (stripped !== src) {
    fs.copyFileSync(appPath, bak);
    src = stripped;
    fs.writeFileSync(appPath, src, "utf8");
    console.log("Stripped Board From: / Education JSX that can white-screen at runtime");
    console.log("Backup:", bak);
    compile = canCompile(esbuild, src);
  }
}

if (!compile.ok) {
  const nuke = run("nuclear-restore-app-jsx.mjs");
  if (nuke !== 0) {
    console.error("\nNuclear restore failed — force a known-good git revision:");
    console.error(`
  cd ~/lyday-gina-backend
  git log --oneline -30 -- gina-backend/frontend/src/App.jsx
  # pick a commit from BEFORE the white screen, then:
  git show <GOOD_SHA>:gina-backend/frontend/src/App.jsx > gina-backend/frontend/src/App.jsx
  cd gina-backend/frontend && npm run build
  cd ../.. && git add gina-backend/frontend/src/App.jsx
  git commit -m "Emergency: restore App.jsx before white screen"
  git pull origin main --rebase && git push origin main
`);
    process.exit(nuke || 2);
  }
  src = fs.readFileSync(appPath, "utf8");
  // Nuclear may restore an older Notes-broken file — strip risky UI again
  const stripped = stripRiskyUiInjections(src);
  if (stripped !== src) {
    fs.writeFileSync(appPath, stripped, "utf8");
    src = stripped;
  }
}

// Bare: only restore Check for actions plumbing (needed for Maria)
const bareSteps = [
  ["patch-check-for-actions.mjs"],
  ["repair-begin-import-session.mjs"],
];
for (const [script] of bareSteps) {
  const status = run(script);
  if (status !== 0) {
    console.warn("Warning:", script, "exited", status, "— continuing");
  }
}

if (full) {
  for (const script of [
    "patch-show-resume-education.mjs",
    "patch-board-sourced-from.mjs",
  ]) {
    const status = run(script);
    if (status !== 0) {
      console.warn("Warning:", script, "exited", status, "— continuing");
    }
  }
}

src = fs.readFileSync(appPath, "utf8");
compile = canCompile(esbuild, src);
if (!compile.ok) {
  console.error(
    "\nREFUSING: App.jsx still does not compile after repairs:",
    compile.error,
  );
  process.exit(2);
}

console.log(`
OK: App.jsx compiles (${full ? "full" : "bare"} mode).

CRITICAL — rebuild dist and push (Railway serves dist, not raw App.jsx):

  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend
  git add gina-backend/frontend/src/App.jsx gina-backend/frontend/dist
  git status
  git commit -m "Fix ATS white screen: bare restore compiling App.jsx"
  git pull origin main --rebase && git push origin main

Then Railway → Redeploy (do not skip) → hard-refresh Gina (Cmd+Shift+R).

Expect the Board again. Do NOT re-run Education / Board From: patches until
the Board is confirmed up. Later (optional):

  node gina-express/frontend/fix-ats-white-screen.mjs ~/lyday-gina-backend/gina-backend --full
`);
