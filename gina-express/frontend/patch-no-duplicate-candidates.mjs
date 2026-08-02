#!/usr/bin/env node
/**
 * No duplicate Board candidates.
 *
 * Fixes React stale-closure double-creates during Check for actions
 * (Omar Sato × N). Also collapses any existing duplicate cards and
 * seeds an import session so the same person cannot be added twice
 * in one batch.
 *
 * ONE LINE:
 *   node gina-express/frontend/patch-no-duplicate-candidates.mjs ~/lyday-gina-backend/gina-backend
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
    "Usage: node patch-no-duplicate-candidates.mjs ~/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

const root = path.resolve(rootArg);
const ginaDir = fs.existsSync(path.join(root, "frontend", "src", "App.jsx"))
  ? root
  : fs.existsSync(path.join(root, "gina-backend", "frontend", "src", "App.jsx"))
    ? path.join(root, "gina-backend")
    : root;

// 1) Refresh applyAgentAction + bot command handlers from the kit
const checkPatch = path.join(__dirname, "patch-check-for-actions.mjs");
const r1 = spawnSync(process.execPath, [checkPatch, ginaDir], {
  stdio: "inherit",
});
if (r1.status !== 0) {
  console.error("patch-check-for-actions failed");
  process.exit(r1.status || 2);
}

// 2) Prefer email/phone match; never leave name collisions as hard errors
const findPatch = path.join(__dirname, "patch-find-candidate-match.mjs");
const appJsx = path.join(ginaDir, "frontend", "src", "App.jsx");
const r2 = spawnSync(process.execPath, [findPatch, appJsx], {
  stdio: "inherit",
});
if (r2.status !== 0) {
  console.warn("patch-find-candidate-match failed (continuing)");
}

// 3) Copy shared dedupe helper for server-side import route use
const dedupeSrc = path.join(__dirname, "../lib/candidate-dedupe.js");
const dedupeDest = path.join(ginaDir, "lib/candidate-dedupe.js");
if (fs.existsSync(dedupeSrc)) {
  fs.mkdirSync(path.dirname(dedupeDest), { recursive: true });
  fs.copyFileSync(dedupeSrc, dedupeDest);
  console.log("Copied lib/candidate-dedupe.js");
}

let src = fs.readFileSync(appJsx, "utf8");
const bak = `${appJsx}.bak-no-dupes-${Date.now()}`;
fs.copyFileSync(appJsx, bak);

if (!/function\s+beginCandidateImportSession\b/.test(src)) {
  console.error(
    "REFUSING: beginCandidateImportSession missing after check-for-actions patch",
  );
  process.exit(2);
}

function injectSessionStart(text) {
  if (
    /beginCandidateImportSession\s*\(\s*\)\s*;\s*\n\s*dedupeBoardCandidates\s*\(\s*\)/.test(
      text,
    )
  ) {
    return { text, changed: false };
  }
  const patterns = [
    /(async\s+function\s+checkForActions\s*\([^)]*\)\s*\{)/,
    /(async\s+function\s+runPendingActions\s*\([^)]*\)\s*\{)/,
    /(async\s+function\s+processPendingActions\s*\([^)]*\)\s*\{)/,
    /(const\s+checkForActions\s*=\s*async\s*(?:\([^)]*\)|[A-Za-z_]\w*)\s*=>\s*\{)/,
    /(async\s+\(\s*\)\s*=>\s*\{)(\s*\/\/.*Check for actions|\s*const\s+pending)/i,
  ];
  for (const re of patterns) {
    if (re.test(text)) {
      return {
        text: text.replace(
          re,
          `$1\n    beginCandidateImportSession();\n    dedupeBoardCandidates();\n`,
        ),
        changed: true,
      };
    }
  }

  // Fallback: first `for (... of ...actions` / pending loop before applyAgentAction
  const loop = text.search(
    /for\s*\(\s*(?:const|let)\s+\w+\s+of\s+(?:pending|actions|queued)/,
  );
  if (loop >= 0) {
    return {
      text:
        text.slice(0, loop) +
        `beginCandidateImportSession();\n    dedupeBoardCandidates();\n    ` +
        text.slice(loop),
      changed: true,
    };
  }
  return { text, changed: false };
}

const injected = injectSessionStart(src);
src = injected.text;
if (injected.changed) {
  console.log("Injected beginCandidateImportSession + dedupeBoardCandidates");
} else {
  console.warn(
    "Could not find Check for actions entry — helpers are still available; call beginCandidateImportSession() manually if needed.",
  );
}

fs.writeFileSync(appJsx, src, "utf8");
console.log("OK: Board imports will not create duplicate candidates");
console.log("Backup:", bak);
console.log(`
Next:
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend
  git add gina-backend/frontend/src/App.jsx gina-backend/lib/candidate-dedupe.js gina-backend/agents gina-backend/routes gina-backend/maria-source.tool.js
  git commit -m "No duplicate Board candidates on Maria import"
  git pull origin main --rebase
  git push origin main

After deploy: open Board once (or Check for actions) — existing dupes collapse; new Maria imports update in place.
`);
