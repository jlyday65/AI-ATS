#!/usr/bin/env node
/**
 * Fix Gina ATS white screen (blank page after a bad App.jsx patch).
 *
 * 1) Ensure App.jsx compiles (nuclear-restore if needed)
 * 2) Re-apply safe patches: Check for actions, import-session repair,
 *    Education UI, sourced-from (all esbuild-gated)
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

const rootArg = String(process.argv[2] || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");
if (!rootArg) {
  console.error(
    "Usage: node fix-ats-white-screen.mjs ~/lyday-gina-backend/gina-backend",
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
  if (!esbuild) return { ok: false, error: "esbuild missing — run npm install in frontend" };
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

function run(script, args = [ginaDir]) {
  const full = path.join(__dirname, script);
  if (!fs.existsSync(full)) {
    console.warn("Skip missing", script);
    return 0;
  }
  console.log("\n→", script);
  const r = spawnSync(process.execPath, [full, ...args], { stdio: "inherit" });
  return r.status ?? 2;
}

const esbuild = loadEsbuild();
let src = fs.readFileSync(appPath, "utf8");
let compile = canCompile(esbuild, src);
console.log("Live App.jsx compiles:", compile.ok, compile.ok ? "" : compile.error);

// Strip known-bad prepended helpers sitting above import lines (SyntaxError → white screen)
if (!compile.ok || /^function\s+candidateSourcedFromText\b/m.test(src.split("import")[0] || "")) {
  const importAt = src.search(/^import\s/m);
  if (importAt > 0) {
    const head = src.slice(0, importAt);
    if (
      /function\s+candidateSourcedFromText\b|function\s+candidateEducationText\b|function\s+beginCandidateImportSession\b/.test(
        head,
      )
    ) {
      const bak = `${appPath}.bak-white-head-${Date.now()}`;
      fs.copyFileSync(appPath, bak);
      src = src.slice(importAt);
      fs.writeFileSync(appPath, src, "utf8");
      console.log("Stripped helper(s) injected above imports (common white-screen cause)");
      console.log("Backup:", bak);
      compile = canCompile(esbuild, src);
    }
  }
}

if (!compile.ok) {
  const nuke = run("nuclear-restore-app-jsx.mjs");
  if (nuke !== 0) {
    console.error("\nNuclear restore failed. Manual fallback:");
    console.error(`
  cd ~/lyday-gina-backend
  git log --oneline -20 -- gina-backend/frontend/src/App.jsx
  # pick a commit from BEFORE the white screen, then:
  git show <commit>:gina-backend/frontend/src/App.jsx > gina-backend/frontend/src/App.jsx
  cd gina-backend/frontend && npm run build
`);
    process.exit(nuke || 2);
  }
}

// Safe re-apply chain (each patcher should refuse on compile failure)
const steps = [
  ["patch-check-for-actions.mjs"],
  ["repair-begin-import-session.mjs"],
  ["patch-show-resume-education.mjs"],
  ["patch-board-sourced-from.mjs"],
  ["patch-notes-bookmark-link.mjs", [path.join(ginaDir, "frontend", "src", "App.jsx")]],
];

for (const [script, args] of steps) {
  const status = run(script, args || [ginaDir]);
  if (status !== 0) {
    console.warn("Warning:", script, "exited", status, "— continuing");
  }
}

src = fs.readFileSync(appPath, "utf8");
compile = canCompile(esbuild, src);
if (!compile.ok) {
  console.error("\nREFUSING: App.jsx still does not compile after repairs:", compile.error);
  process.exit(2);
}

console.log(`
OK: App.jsx compiles — rebuild + redeploy to clear the white screen:

  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend
  git add gina-backend/frontend/src/App.jsx
  git commit -m "Fix ATS white screen: restore compiling App.jsx"
  git pull origin main --rebase && git push origin main

Then Railway redeploy (or wait for auto-deploy) and hard-refresh Gina ATS
(Cmd+Shift+R). If still blank, open DevTools → Console and send the red error.
`);
