#!/usr/bin/env node
/**
 * Add "Candidate File" toolbar button on ATS (manual entry → /candidate-file).
 * Places it before Add candidate. esbuild-gated. Never nests inside the button.
 *
 * ONE LINE:
 *   node gina-express/frontend/patch-candidate-file-toolbar.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 */

import fs from "fs";
import path from "path";
import { createRequire } from "module";
import {
  resolveAppJsxPath,
  extractAddCandidateButton,
  extractClassNameAttr,
  extractStyleObjectBody,
} from "./notes-toolbar-markup.mjs";

const target = resolveAppJsxPath(process.argv);
if (!target || !fs.existsSync(target)) {
  console.error(
    "Usage (one line): node patch-candidate-file-toolbar.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx",
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

function buildLink({ classNameAttr = "", styleBody = "" } = {}) {
  const classLine = classNameAttr ? `\n          ${classNameAttr}` : "";
  const base = styleBody
    ? `${styleBody},`
    : `display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, background: "#2F6459", color: "#fff", border: "none", fontSize: 13,`;
  return `<a
          data-candidate-file-link="1"
          href="/candidate-file"
          target="_blank"
          rel="noreferrer"${classLine}
          style={{
            ${base}
            textDecoration: "none",
            cursor: "pointer",
            marginLeft: 8,
          }}
          title="Manual Candidate File entry"
        >
          Candidate File
        </a>`;
}

const esbuild = loadEsbuild(target);
const live = fs.readFileSync(target, "utf8");
const liveOk = canCompile(esbuild, live);
if (!liveOk.ok) {
  console.error("App.jsx does not compile:", liveOk.error);
  console.error("Restore a compiling App.jsx before adding the Candidate File button.");
  process.exit(2);
}

const bak = `${target}.bak-cf-toolbar-${Date.now()}`;
fs.copyFileSync(target, bak);

let src = stripCandidateFileLink(live);
const found = extractAddCandidateButton(src);
if (!found) {
  console.error("Could not find Add candidate button");
  process.exit(2);
}

const btn = found.full;
const link = buildLink({
  classNameAttr: extractClassNameAttr(found.attrs),
  styleBody: extractStyleObjectBody(btn),
});
// Order: … Questions → Kimberley Notes? → Candidate File → Add candidate
src = src.slice(0, found.index) + `${link}\n              ${btn}` + src.slice(found.end);

if ((src.match(/data-candidate-file-link=/g) || []).length !== 1) {
  console.error("REFUSING: expected exactly one Candidate File link");
  process.exit(2);
}
if (/Add candidate\s*<a\b[^>]*data-candidate-file-link/i.test(src)) {
  console.error("REFUSING: link landed inside Add candidate button");
  process.exit(2);
}

const after = canCompile(esbuild, src);
if (!after.ok) {
  console.error("REFUSING: insert would break compile:", after.error);
  process.exit(2);
}

fs.writeFileSync(target, src, "utf8");
console.log("OK: Candidate File toolbar button before Add candidate");
console.log("Backup:", bak);
console.log("Wrote:", target);
console.log(`
Next:
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend
  git add gina-backend/frontend/src/App.jsx
  git commit -m "Add Candidate File toolbar button for manual entry"
  git push origin main
`);
