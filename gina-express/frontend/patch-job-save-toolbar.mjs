#!/usr/bin/env node
/**
 * Add "Save / Export" toolbar button on ATS Board.
 * Collects current board candidates + selected job title, downloads combined
 * Board + Candidate File packet, archives for Maria talent pool.
 *
 * ONE LINE:
 *   node gina-express/frontend/patch-job-save-toolbar.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
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
    "Usage: node patch-job-save-toolbar.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx",
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

function stripJobSaveButton(src) {
  return String(src).replace(
    /\s*<button\b[^>]*data-job-save-export=["']1["'][^>]*>[\s\S]*?<\/button>/gi,
    "",
  );
}

function ensureHelper(src) {
  if (/async function saveBoardAndCandidateFileExport\s*\(/.test(src)) {
    return src;
  }
  const helper = `
  async function saveBoardAndCandidateFileExport() {
    try {
      const board = Array.isArray(candidates) ? candidates : [];
      const jobTitle =
        (typeof selectedJob !== "undefined" && selectedJob?.title) ||
        (typeof activeJob !== "undefined" && activeJob?.title) ||
        (typeof currentJob !== "undefined" && currentJob?.title) ||
        (board[0]?.role || board[0]?.jobTitle || "").trim();
      if (!jobTitle) {
        alert("Select or open a job first, then Save / Export.");
        return;
      }
      const jobDescription =
        (typeof selectedJob !== "undefined" && selectedJob?.description) ||
        (typeof activeJob !== "undefined" && activeJob?.description) ||
        "";
      const location =
        (typeof selectedJob !== "undefined" && selectedJob?.location) ||
        (typeof activeJob !== "undefined" && activeJob?.location) ||
        "";
      const res = await fetch("/ats/job-save-export.txt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobTitle,
          jobDescription,
          location,
          boardCandidates: board,
          pushToTalentPool: true,
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        alert("Save / Export failed: " + text.slice(0, 300));
        return;
      }
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "job-save-" + String(jobTitle).replace(/[^\\w.-]+/g, "_").slice(0, 40) + ".txt";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      alert(
        "Downloaded Board + Candidate File.\\nSave the .txt to your external drive.\\nPeople archived for Maria on similar future jobs.",
      );
    } catch (err) {
      alert("Save / Export failed: " + (err?.message || err));
    }
  }
`;
  // Insert before return of main component if possible
  const returnIdx = src.search(
    /export\s+default\s+function\s+(?:App|CandidateTracker)\b[\s\S]*?\n\s*return\s*\(/,
  );
  if (returnIdx >= 0) {
    const insertAt = src.indexOf("return (", returnIdx);
    return src.slice(0, insertAt) + helper + "\n" + src.slice(insertAt);
  }
  // Fallback: append near end before last export default
  const exp = src.lastIndexOf("export default");
  if (exp > 0) return src.slice(0, exp) + helper + "\n" + src.slice(exp);
  return src + "\n" + helper;
}

function buildButton({ classNameAttr = "", styleBody = "" } = {}) {
  const classLine = classNameAttr ? `\n          ${classNameAttr}` : "";
  const base = styleBody
    ? `${styleBody},`
    : `display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, background: "#1F4E45", color: "#fff", border: "none", fontSize: 13,`;
  return `<button
          type="button"
          data-job-save-export="1"${classLine}
          style={{
            ${base}
            cursor: "pointer",
            marginLeft: 8,
          }}
          title="Download Board + Candidate File (save to external drive). Best after Michelle screening."
          onClick={() => { void saveBoardAndCandidateFileExport(); }}
        >
          Save / Export
        </button>`;
}

const esbuild = loadEsbuild(target);
const live = fs.readFileSync(target, "utf8");
const liveOk = canCompile(esbuild, live);
if (!liveOk.ok) {
  console.error("App.jsx does not compile:", liveOk.error);
  process.exit(2);
}

const bak = `${target}.bak-job-save-toolbar-${Date.now()}`;
fs.copyFileSync(target, bak);

let src = stripJobSaveButton(live);
src = ensureHelper(src);

const found = extractAddCandidateButton(src);
if (!found) {
  // fallback: prepend near Candidate File link if present
  const cf = src.search(/data-candidate-file-link=["']1["']/);
  if (cf < 0) {
    console.error("Could not find Add candidate button or Candidate File link");
    process.exit(2);
  }
  const btn = buildButton();
  // insert after candidate file anchor end
  const close = src.indexOf("</a>", cf);
  src = src.slice(0, close + 4) + "\n        " + btn + src.slice(close + 4);
} else {
  const classNameAttr = extractClassNameAttr(found.text) || "";
  const styleBody = extractStyleObjectBody(found.text) || "";
  const btn = buildButton({ classNameAttr, styleBody });
  src =
    src.slice(0, found.index) + btn + "\n        " + src.slice(found.index);
}

const compiled = canCompile(esbuild, src);
if (!compiled.ok) {
  console.error("Patched App.jsx failed compile:", compiled.error);
  fs.copyFileSync(bak, target);
  process.exit(2);
}

fs.writeFileSync(target, src, "utf8");
console.log("Added Save / Export toolbar button");
console.log("Backup", path.basename(bak));
console.log("Next: cd frontend && npm run build");
