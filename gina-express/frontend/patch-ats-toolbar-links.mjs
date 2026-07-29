#!/usr/bin/env node
/**
 * Restore ATS toolbar links before Add candidate:
 *   … Questions → Kimberley Notes → Candidate File → Add candidate
 *
 * esbuild-gated. Never nests links inside the Add candidate <button>.
 *
 * ONE LINE:
 *   node gina-express/frontend/patch-ats-toolbar-links.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 */

import fs from "fs";
import path from "path";
import { createRequire } from "module";
import {
  resolveAppJsxPath,
  extractAddCandidateButton,
  extractClassNameAttr,
  extractStyleObjectBody,
  stripExistingNotesToolbar,
} from "./notes-toolbar-markup.mjs";

const target = resolveAppJsxPath(process.argv);
if (!target || !fs.existsSync(target)) {
  console.error(
    "Usage (one line): node patch-ats-toolbar-links.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx",
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

function stripCandidateFileLink(src) {
  return String(src).replace(
    /\s*<a\b[^>]*data-candidate-file-link=["']1["'][^>]*>[\s\S]*?<\/a>/gi,
    "",
  );
}

function buildLink({
  marker,
  href,
  label,
  classNameAttr = "",
  styleBody = "",
  title = "",
}) {
  const classLine = classNameAttr ? `\n          ${classNameAttr}` : "";
  const titleLine = title ? `\n          title=${JSON.stringify(title)}` : "";
  const base = styleBody
    ? `${styleBody},`
    : `display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, background: "#2F6459", color: "#fff", border: "none", fontSize: 13,`;
  return `<a
          ${marker}="1"
          href="${href}"
          target="_blank"
          rel="noreferrer"${classLine}${titleLine}
          style={{
            ${base}
            textDecoration: "none",
            cursor: "pointer",
            marginLeft: 8,
          }}
        >
          ${label}
        </a>`;
}

const esbuild = loadEsbuild(target);
const live = fs.readFileSync(target, "utf8");
const liveOk = canCompile(esbuild, live);
if (!liveOk.ok) {
  console.error("App.jsx does not compile:", liveOk.error);
  console.error(
    "Restore a compiling App.jsx first, then re-run this patch:\n  node gina-express/frontend/nuclear-restore-app-jsx.mjs ~/lyday-gina-backend/gina-backend",
  );
  process.exit(2);
}

const bak = `${target}.bak-ats-toolbar-${Date.now()}`;
fs.copyFileSync(target, bak);

let src = stripExistingNotesToolbar(live);
src = stripCandidateFileLink(src);

const found = extractAddCandidateButton(src);
if (!found) {
  console.error("Could not find Add candidate button");
  process.exit(2);
}

const classNameAttr = extractClassNameAttr(found.attrs);
const styleBody = extractStyleObjectBody(found.full);
const notes = buildLink({
  marker: "data-kimberley-notes-link",
  href: "/notes",
  label: "Kimberley Notes",
  classNameAttr,
  styleBody,
  title: "Team updates from Maria / Michelle / Kelley / Ashton",
});
const candFile = buildLink({
  marker: "data-candidate-file-link",
  href: "/candidate-file",
  label: "Candidate File",
  classNameAttr,
  styleBody,
  title: "Manual Candidate File entry",
});

const replacement = `${notes}\n              ${candFile}\n              ${found.full}`;
src = src.slice(0, found.index) + replacement + src.slice(found.end);

if ((src.match(/data-kimberley-notes-link=/g) || []).length !== 1) {
  console.error("REFUSING: expected exactly 1 Kimberley Notes link");
  process.exit(2);
}
if ((src.match(/data-candidate-file-link=/g) || []).length !== 1) {
  console.error("REFUSING: expected exactly 1 Candidate File link");
  process.exit(2);
}
if (/Add candidate\s*<a\b/i.test(src)) {
  console.error("REFUSING: a link landed inside Add candidate button");
  process.exit(2);
}

const after = canCompile(esbuild, src);
if (!after.ok) {
  console.error("REFUSING: insert would break compile:", after.error);
  process.exit(2);
}

fs.writeFileSync(target, src, "utf8");
console.log("OK: Kimberley Notes + Candidate File before Add candidate");
console.log("Backup:", bak);
console.log("Wrote:", target);
console.log(`
Next:
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend
  git add gina-backend/frontend/src/App.jsx
  git status
  git commit -m "Restore Kimberley Notes + Candidate File toolbar buttons"
  git push origin main

Hard refresh the ATS board after Railway redeploy.
`);
