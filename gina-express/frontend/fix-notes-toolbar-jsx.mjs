#!/usr/bin/env node
/**
 * DEPRECATED for corrupt App.jsx.
 * If App.jsx does not build, use nuclear-restore-app-jsx.mjs first.
 * This script now refuses to write unless esbuild can compile the result.
 */

import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import {
  insertNotesWithAddCandidate,
  isToolbarCorrupt,
  resolveAppJsxPath,
} from "./notes-toolbar-markup.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appPath = resolveAppJsxPath(process.argv);
if (!appPath || !fs.existsSync(appPath)) {
  console.error(
    "Usage (one line): node fix-notes-toolbar-jsx.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx",
  );
  process.exit(1);
}

function loadEsbuild(appFile) {
  const frontend = path.resolve(path.dirname(appFile), "..");
  try {
    const req = createRequire(
      path.join(frontend, "node_modules", "esbuild", "package.json"),
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

const esbuild = loadEsbuild(appPath);
const live = fs.readFileSync(appPath, "utf8");
const liveOk = canCompile(esbuild, live);
console.log("Live compiles?", liveOk.ok, liveOk.error || "");

if (!liveOk.ok) {
  console.error(`
App.jsx does NOT compile. Do not patch Notes onto a broken file.

Run this FIRST (one line):
  node ${path.join(__dirname, "nuclear-restore-app-jsx.mjs")} ~/lyday-gina-backend/gina-backend

Then rebuild. Only after a green build, add Notes with:
  node ${path.join(__dirname, "patch-notes-bookmark-link.mjs")} ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
`);
  // Auto-run nuclear restore for convenience
  const nuclear = path.join(__dirname, "nuclear-restore-app-jsx.mjs");
  const ginaDir = path.resolve(path.dirname(appPath), "..", "..");
  console.log("Auto-running nuclear restore…");
  const r = spawnSync(process.execPath, [nuclear, ginaDir], {
    stdio: "inherit",
  });
  process.exit(r.status || 0);
}

if (isToolbarCorrupt(live)) {
  console.log("Toolbar markers corrupt but file compiles — stripping + sibling insert");
}

const bak = `${appPath}.bak-fix-notes-toolbar-${Date.now()}`;
fs.copyFileSync(appPath, bak);

const result = insertNotesWithAddCandidate(live);
if (!result.ok) {
  console.error("REFUSING:", result.reason);
  process.exit(2);
}

const after = canCompile(esbuild, result.src);
if (!after.ok) {
  console.error("REFUSING: insert would break compile:", after.error);
  console.error("Backup unused; file not written.");
  process.exit(2);
}

fs.writeFileSync(appPath, result.src, "utf8");
console.log("OK: Notes sibling inserted; esbuild compile passed");
console.log("Backup:", bak);
console.log("Wrote:", appPath);
console.log(`
Next:
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend
  git add gina-backend/frontend/src/App.jsx
  git status
  git commit -m "Add Kimberley Notes beside Add candidate"
  git push origin main
`);
