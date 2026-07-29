#!/usr/bin/env node
/**
 * Emergency: disable Kimberley Notes UI so Gina ATS stops white-screening.
 *
 * Usage (one line):
 *   node gina-express/frontend/emergency-disable-kimberley-notes.mjs /Users/jameslyday/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 */

import fs from "fs";
import path from "path";

const target = path.resolve(
  String(process.argv[2] || "").replace(/^~/, process.env.HOME || "").trim(),
);
if (!target || !fs.existsSync(target)) {
  console.error(
    "Usage: node emergency-disable-kimberley-notes.mjs /Users/.../frontend/src/App.jsx",
  );
  process.exit(1);
}

let src = fs.readFileSync(target, "utf8");
const bak = `${target}.bak-emergency-${Date.now()}`;
fs.copyFileSync(target, bak);
let n = 0;

// Remove any broken nested emergency comments / kimberley render lines near AgentPanel
const badLines = [
  /\n[ \t]*\{\/\* EMERGENCY disabled:[\s\S]*?\*\/\}\s*\n/g,
  /\n[ \t]*\{false && null \/\* EMERGENCY disabled KimberleyNotesPanel \*\/\}\s*\n/g,
  /\n[ \t]*\{view === "kimberley" && <KimberleyNotesPanel \/>\}\s*\n/g,
  /\n[ \t]*\{view === "kimberley" \|\| tab === "kimberley"[\s\S]*?<KimberleyNotesPanel\s*\/>\s*:\s*null\s*\}\s*\n/g,
];
for (const re of badLines) {
  const next = src.replace(re, "\n");
  if (next !== src) {
    n += 1;
    src = next;
  }
}

// Stub panel function
const stub = `function KimberleyNotesPanel() {
  // EMERGENCY stub — panel disabled to restore ATS UI
  return null;
}
`;
const start = src.search(/function\s+KimberleyNotesPanel\s*\(/);
if (start >= 0) {
  const after = src.slice(start + 1);
  const endRel = after.search(
    /\n\s*function\s+(ResumeUploadPanel|CandidateTracker|AgentPanel|MariaView|App|GinaBriefingCard)\b/,
  );
  if (endRel >= 0) {
    const end = start + 1 + endRel;
    src = src.slice(0, start) + stub + "\n" + src.slice(end);
    n += 1;
    console.log("Stubbed KimberleyNotesPanel → return null");
  }
} else {
  // Insert stub before ResumeUploadPanel so name still resolves if referenced
  const anchor = src.search(/function\s+ResumeUploadPanel\s*\(/);
  if (anchor >= 0) {
    src = src.slice(0, anchor) + stub + "\n" + src.slice(anchor);
    n += 1;
    console.log("Inserted stub KimberleyNotesPanel");
  }
}

// Remove kimberley nav entry
if (/id:\s*["']kimberley["']/.test(src)) {
  src = src.replace(
    /\s*,?\s*\{\s*id:\s*["']kimberley["']\s*,\s*label:\s*["']Kimberley's Notes["']\s*\}/g,
    "",
  );
  src = src.replace(/,\s*,/g, ",");
  n += 1;
  console.log("Removed kimberley nav id");
}

// Ensure agent → maria region has no leftover junk comment with nested */
src = src.replace(
  /(\{view === "agent" && <AgentPanel[\s\S]*?\/>\})\s*\n\s*\{\/\*[\s\S]*?\*\/\}\s*\n(\s*\{view === "maria")/,
  "$1\n\n$2",
);

if (/EMERGENCY disabled:.*EMERGENCY disabled/.test(src) || /\{\/\*[\s\S]*\/\*[\s\S]*\*\//.test(src)) {
  // last-resort: delete any line containing both EMERGENCY and KimberleyNotesPanel
  src = src
    .split("\n")
    .filter((line) => !(line.includes("EMERGENCY") && line.includes("Kimberley")))
    .join("\n");
  n += 1;
  console.log("Stripped leftover EMERGENCY Kimberley lines");
}

fs.writeFileSync(target, src, "utf8");
console.log("Backup:", bak);
console.log(`Emergency disable applied (${n})`);
console.log("Wrote:", target);
console.log(`
Next:
  cd ~/lyday-gina-backend/gina-backend/frontend
  npm run build
  cd ~/lyday-gina-backend/gina-backend
  git add frontend/src/App.jsx
  git commit -m "Emergency: disable Kimberley Notes UI to restore ATS"
  git push origin main
`);
