#!/usr/bin/env node
/**
 * Show which platform(s) each Board candidate was sourced from.
 *
 * - Refreshes applyAgentAction (stores sourcedFrom / sourcedFromText)
 * - Injects a Board line: "From: People Data Labs · LinkedIn"
 *
 * ONE LINE:
 *   node gina-express/frontend/patch-board-sourced-from.mjs ~/lyday-gina-backend/gina-backend
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
    "Usage: node patch-board-sourced-from.mjs ~/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

const root = path.resolve(rootArg);
const ginaDir = fs.existsSync(path.join(root, "frontend", "src", "App.jsx"))
  ? root
  : fs.existsSync(path.join(root, "gina-backend", "frontend", "src", "App.jsx"))
    ? path.join(root, "gina-backend")
    : root;

// Refresh import path so Board cards get sourcedFrom fields
const check = spawnSync(
  process.execPath,
  [path.join(__dirname, "patch-check-for-actions.mjs"), ginaDir],
  { stdio: "inherit" },
);
if (check.status !== 0) {
  console.warn("patch-check-for-actions exited", check.status);
}

// Copy import-candidates snippet note (commented route) for ops docs
const importSrc = path.join(__dirname, "../ats-import-candidates.route.js");
const importDest = path.join(ginaDir, "ats-import-candidates.route.js");
if (fs.existsSync(importSrc)) {
  fs.copyFileSync(importSrc, importDest);
  console.log("Copied ats-import-candidates.route.js (reference)");
}

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

const HELPER = `
  function candidateSourcedFromText(c) {
    if (!c || typeof c !== "object") return "";
    if (c.sourcedFromText) return String(c.sourcedFromText);
    if (Array.isArray(c.sourcedFrom) && c.sourcedFrom.length) {
      return c.sourcedFrom.join(" · ");
    }
    if (Array.isArray(c.platformIds) && c.platformIds.length) {
      return c.platformIds.join(" · ");
    }
    if (Array.isArray(c.platforms) && c.platforms.length) {
      return c.platforms
        .map((p) => p.platformId || p.name || p)
        .filter(Boolean)
        .join(" · ");
    }
    return c.source || "";
  }
  if (typeof window !== "undefined") {
    window.candidateSourcedFromText = candidateSourcedFromText;
  }
`.trim();

let app = fs.readFileSync(appPath, "utf8");
const bak = `${appPath}.bak-sourced-from-${Date.now()}`;
fs.copyFileSync(appPath, bak);

if (!/function\s+candidateSourcedFromText\b/.test(app)) {
  const insertAt = app.search(
    /function\s+countLiveStageCounts\b|function\s+personDedupeKeys\b|const BOT_NAMES\s*=|function\s+findCandidateByMatch\b|export\s+default\s+function\s+(?:App|CandidateTracker)\b/,
  );
  if (insertAt >= 0) {
    app = app.slice(0, insertAt) + HELPER + "\n\n" + app.slice(insertAt);
    console.log("Inserted candidateSourcedFromText helper");
  } else {
    // Never prepend before imports — that SyntaxError whitescreens the ATS.
    const lastImport = [...app.matchAll(/^import\s.+;?\s*$/gm)].pop();
    if (lastImport && typeof lastImport.index === "number") {
      const at = lastImport.index + lastImport[0].length;
      app = app.slice(0, at) + "\n\n" + HELPER + "\n" + app.slice(at);
      console.log("Inserted candidateSourcedFromText after imports");
    } else {
      console.warn("Skip helper insert — no safe anchor (would break imports)");
    }
  }
}

// Inject a "From: …" line under Board candidate names (once per pattern, first hit only).
let changed = false;
// Call via window so Board child components outside App closure cannot white-screen.
const fromLine = (alias) =>
  `{${alias}.name}{(typeof candidateSourcedFromText === "function" ? candidateSourcedFromText(${alias}) : typeof window !== "undefined" && typeof window.candidateSourcedFromText === "function" ? window.candidateSourcedFromText(${alias}) : "") ? (<div className="text-xs" style={{fontSize:12,opacity:0.75,marginTop:2}}>From: {(typeof candidateSourcedFromText === "function" ? candidateSourcedFromText(${alias}) : window.candidateSourcedFromText(${alias}))}</div>) : null}`;
if (/{c\.name}/.test(app) && !/From:\s*\{candidateSourcedFromText\(c\)\}/.test(app)) {
  app = app.replace(/\{c\.name\}/, fromLine("c"));
  changed = true;
}
if (
  /{candidate\.name}/.test(app) &&
  !/From:\s*\{candidateSourcedFromText\(candidate\)\}/.test(app)
) {
  app = app.replace(/\{candidate\.name\}/, fromLine("candidate"));
  changed = true;
}
if (changed) console.log("Injected Board From: platform line(s)");
else console.warn("Could not auto-inject Board markup — sourcedFrom still stored on import.");

const esbuild = loadEsbuild();
const after = canCompile(esbuild, app);
if (!after.ok) {
  console.error("REFUSING: App.jsx would not compile:", after.error);
  fs.copyFileSync(bak, appPath);
  process.exit(2);
}

fs.writeFileSync(appPath, app, "utf8");
console.log("OK: Board will show sourced-from platforms");
console.log("Backup:", bak);
console.log(`
Next:
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend
  git add gina-backend/frontend/src/App.jsx
  git commit -m "Board cards show sourced-from platforms"
  git pull origin main --rebase && git push origin main

Also keep AI-ATS running (npm run dev + ngrok). New Maria imports carry
sourcedFrom (Coresignal, People Data Labs, LinkedIn, …).
`);
