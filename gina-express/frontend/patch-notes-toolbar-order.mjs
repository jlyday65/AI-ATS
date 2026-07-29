#!/usr/bin/env node
/**
 * Insert "Kimberley Notes" in the main ATS toolbar order:
 *   Reminders, CSV, Import CSV, Backup, Import, Questions,
 *   Kimberley Notes, Add candidate
 *
 * Plain sibling control before Add candidate — no span wrap, never inside the button.
 * Refuses to write if App.jsx does not compile (esbuild).
 *
 * ONE LINE:
 *   node gina-express/frontend/patch-notes-toolbar-order.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 */

import fs from "fs";
import path from "path";
import { createRequire } from "module";
import {
  resolveAppJsxPath,
  stripExistingNotesToolbar,
  extractAddCandidateButton,
  extractClassNameAttr,
  extractStyleObjectBody,
  isToolbarCorrupt,
} from "./notes-toolbar-markup.mjs";

const target = resolveAppJsxPath(process.argv);
if (!target || !fs.existsSync(target)) {
  console.error(
    "Usage (one line): node patch-notes-toolbar-order.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx",
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

function buildToolbarNotes({ classNameAttr = "", styleBody = "" } = {}) {
  const classLine = classNameAttr ? `\n          ${classNameAttr}` : "";
  // Match typical toolbar chrome; fall back to teal filled control like Add candidate
  const base = styleBody
    ? `${styleBody},`
    : `display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, background: "#2F6459", color: "#fff", border: "none", fontSize: 13,`;
  return `<a
          data-kimberley-notes-link="1"
          href="/notes"
          target="_blank"
          rel="noreferrer"${classLine}
          style={{
            ${base}
            textDecoration: "none",
            cursor: "pointer",
            marginLeft: 8,
          }}
        >
          Kimberley Notes
        </a>`;
}

const esbuild = loadEsbuild(target);
const live = fs.readFileSync(target, "utf8");
const liveOk = canCompile(esbuild, live);
if (!liveOk.ok) {
  console.error("App.jsx does not compile:", liveOk.error);
  console.error(`
Restore a compiling file first, then re-run this patch:

  cd ~/lyday-gina-backend
  git show b0f53fe:gina-backend/frontend/src/App.jsx > gina-backend/frontend/src/App.jsx
  cd gina-backend/frontend && npm run build

  cd ~/AI-ATS
  node gina-express/frontend/patch-notes-toolbar-order.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
`);
  process.exit(2);
}

const bak = `${target}.bak-notes-order-${Date.now()}`;
fs.copyFileSync(target, bak);

let src = stripExistingNotesToolbar(live);
// Drop radius hacks from earlier experiments
src = src.replace(
  /\s*borderTopRightRadius\s*:\s*0\s*,\s*borderBottomRightRadius\s*:\s*0\s*,?/g,
  "",
);

const found = extractAddCandidateButton(src);
if (!found) {
  console.error("Could not find Add candidate button");
  process.exit(2);
}

let btn = found.full.replace(
  /\s*borderTopRightRadius\s*:\s*0\s*,\s*borderBottomRightRadius\s*:\s*0\s*,?/g,
  "",
);
btn = btn.replace(/\s*style=\{\{\s*\}\}/g, "");

const notes = buildToolbarNotes({
  classNameAttr: extractClassNameAttr(found.attrs),
  styleBody: extractStyleObjectBody(btn),
});

// Order: … Questions, Kimberley Notes, Add candidate
// Insert Notes BEFORE Add candidate button
const replacement = `${notes}\n              ${btn}`;
src = src.slice(0, found.index) + replacement + src.slice(found.end);

// esbuild is the source of truth (button-count heuristics false-positive on real ATS JSX)
if ((src.match(/data-kimberley-notes-link=/g) || []).length !== 1) {
  console.error("REFUSING: expected exactly one Notes link");
  process.exit(2);
}
if (/data-kimberley-notes-group=/.test(src)) {
  console.error("REFUSING: notes group wrapper present");
  process.exit(2);
}
if (/Add candidate\s*<a\b[^>]*data-kimberley-notes-link/i.test(src)) {
  console.error("REFUSING: Notes landed inside Add candidate button");
  process.exit(2);
}

const after = canCompile(esbuild, src);
if (!after.ok) {
  console.error("REFUSING: insert would break compile:", after.error);
  process.exit(2);
}

const marker = isToolbarCorrupt(src);
if (marker) {
  console.warn("Warning: heuristic marker after insert:", marker, "(esbuild OK — continuing)");
}

fs.writeFileSync(target, src, "utf8");
console.log("OK: Kimberley Notes placed before Add candidate in toolbar order");
console.log("Backup:", bak);
console.log("Wrote:", target);
console.log(`
Expected toolbar order:
  Reminders → CSV → Import CSV → Backup → Import → Questions → Kimberley Notes → Add candidate

Next:
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend
  git add gina-backend/frontend/src/App.jsx
  git status
  git commit -m "Place Kimberley Notes before Add candidate in toolbar"
  git push origin main
`);
