#!/usr/bin/env node
/**
 * Show full resumeText on the candidate profile (not just the demo summary line).
 *
 * Usage:
 *   node /tmp/patch-show-resume-text.mjs \
 *     /Users/jameslyday/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 */

import fs from "fs";
import path from "path";

const target = path.resolve(
  String(process.argv[2] || "").replace(/^~/, process.env.HOME || ""),
);
if (!target || !fs.existsSync(target)) {
  console.error(
    "Usage: node /tmp/patch-show-resume-text.mjs /Users/.../frontend/src/App.jsx",
  );
  process.exit(1);
}

let src = fs.readFileSync(target, "utf8");
const bak = `${target}.bak-resumeui-${Date.now()}`;
fs.copyFileSync(target, bak);

let changes = [];

// 1) Ensure addCandidate persists resumeText / summary / headline
if (/function addCandidate\s*\(/.test(src) && !/resumeText:\s*data\.resumeText/.test(src)) {
  // Try common patterns inside addCandidate body
  const m = src.match(/function addCandidate\s*\([^)]*\)\s*\{/);
  if (m) {
    const start = m.index + m[0].length;
    // Inject field mapping near the new candidate object if we find `const c = {` or similar
    if (/resumeText/.test(src.slice(start, start + 800))) {
      changes.push("addCandidate already mentions resumeText");
    } else {
      // Patch setCandidates / object literal fields
      const slice = src.slice(start, start + 1200);
      if (/role:\s*data\.role/.test(slice)) {
        src = src.replace(
          /role:\s*data\.role([^,\n]*)/,
          `role: data.role$1,
      resumeText: data.resumeText || data.resume_text || "",
      summary: data.summary || "",
      headline: data.headline || ""`,
        );
        changes.push("added resumeText/summary/headline to addCandidate object");
      }
    }
  }
}

// 2) Ensure import_candidate path passes resumeText (prefer jobTitle already handled elsewhere)
src = src.replace(
  /resumeText:\s*payload\.resumeText\s*\|\|\s*""/g,
  'resumeText: payload.resumeText || payload.resume_text || payload.summary || ""',
);

// 3) Insert a Resume panel in the active candidate detail view
const RESUME_BLOCK = `
        {(active.resumeText || active.resume_text) ? (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: "#5C584C" }}>Resume</div>
            <pre style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontSize: 12.5,
              lineHeight: 1.45,
              background: "#F7F6F1",
              border: "1px solid #E6E2D6",
              borderRadius: 8,
              padding: 12,
              maxHeight: 320,
              overflow: "auto",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              color: "#2C2A24",
            }}>{active.resumeText || active.resume_text}</pre>
          </div>
        ) : null}
`;

if (/active\.resumeText|\(active\.resumeText/.test(src)) {
  changes.push("Resume UI already present");
} else if (/\bactive\.summary\b/.test(src)) {
  // Place after first active.summary render block if possible
  const idx = src.search(/\{active\.summary\}|active\.summary\s*&&|\{active\.summary\s*\|\|/);
  if (idx >= 0) {
    // Find end of that JSX expression/element — insert after the containing line
    const lineEnd = src.indexOf("\n", idx);
    src = src.slice(0, lineEnd + 1) + RESUME_BLOCK + src.slice(lineEnd + 1);
    changes.push("inserted Resume block after active.summary");
  } else {
    // Fallback: before closing of detail panel — after "Notes" header if any
    const notes = src.search(/Notes|addNote\(|active\.notes/);
    if (notes >= 0) {
      const lineStart = src.lastIndexOf("\n", notes);
      src = src.slice(0, lineStart + 1) + RESUME_BLOCK + src.slice(lineStart + 1);
      changes.push("inserted Resume block near Notes");
    } else {
      console.warn("Could not find a place to insert Resume UI automatically");
    }
  }
} else {
  // Look for active.name detail header
  const nameIdx = src.search(/active\.name/);
  if (nameIdx >= 0 && src.includes("active &&")) {
    const lineEnd = src.indexOf("\n", nameIdx);
    // insert later in file near other active fields - find second/third active. occurrence cluster
    const cluster = src.indexOf("active.email", nameIdx);
    const anchor = cluster > 0 ? src.indexOf("\n", cluster) : lineEnd;
    src = src.slice(0, anchor + 1) + RESUME_BLOCK + src.slice(anchor + 1);
    changes.push("inserted Resume block near active.email/name");
  } else {
    console.warn("No active.summary / active.name anchor — Resume UI not inserted");
  }
}

fs.writeFileSync(target, src, "utf8");
console.log("Backup:", bak);
if (!changes.length) console.log("No changes made — paste a snippet of the candidate detail JSX");
else changes.forEach((c) => console.log(" -", c));
console.log(`
Next:
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend/gina-backend
  git add frontend/src/App.jsx
  git commit -m "Show full resumeText on candidate profile"
  git push origin main
`);
