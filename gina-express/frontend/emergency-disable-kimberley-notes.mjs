#!/usr/bin/env node
/**
 * Emergency: disable Kimberley Notes UI so Gina ATS stops white-screening.
 *
 * Removes Gate + Panel renders, stubs both, strips nav (both label spellings).
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

function braceEnd(text, braceAt) {
  let depth = 0;
  for (let j = braceAt; j < text.length; j++) {
    if (text[j] === "{") depth++;
    else if (text[j] === "}") {
      depth--;
      if (depth === 0) return j + 1;
    }
  }
  return -1;
}

function replaceBlock(kind, name, replacement) {
  const re =
    kind === "class"
      ? new RegExp(`class\\s+${name}\\s+extends\\s+[\\w.]+`)
      : new RegExp(`function\\s+${name}\\s*\\(`);
  const start = src.search(re);
  if (start < 0) return false;
  const braceAt = src.indexOf("{", start);
  let end = braceEnd(src, braceAt);
  if (end < 0) {
    const after = src.slice(start + 1);
    const endRel = after.search(
      /\n\s*(?:function\s+|class\s+)(ResumeUploadPanel|CandidateTracker|AgentPanel|MariaView|App|GinaBriefingCard|KimberleyNotesPanel|KimberleyNotesGate)\b/,
    );
    if (endRel < 0) return false;
    end = start + 1 + endRel;
  }
  src = src.slice(0, start) + replacement + "\n" + src.slice(end);
  return true;
}

// Remove kimberley view mounts (Panel or Gate)
const mountRes = [
  /\n[ \t]*\{view === "kimberley" && <KimberleyNotes(?:Panel|Gate)\s*\/>\}\s*\n/g,
  /\n[ \t]*\{view === "kimberley" \|\| tab === "kimberley"[\s\S]*?<KimberleyNotes(?:Panel|Gate)\s*\/>\s*:\s*null\s*\}\s*\n/g,
  /\n[ \t]*\{\/\* EMERGENCY[\s\S]*?\*\/\}\s*\n/g,
  /\n[ \t]*\{false && null \/\* EMERGENCY[\s\S]*?\*\/\}\s*\n/g,
];
for (const re of mountRes) {
  const next = src.replace(re, "\n");
  if (next !== src) {
    n += 1;
    src = next;
  }
}

const gateStub = `class KimberleyNotesGate extends React.Component {
  render() {
    // EMERGENCY stub — Notes disabled to restore ATS UI
    return null;
  }
}
`;

const panelStub = `function KimberleyNotesPanel() {
  // EMERGENCY stub — panel disabled to restore ATS UI
  return null;
}
`;

if (replaceBlock("class", "KimberleyNotesGate", gateStub)) {
  n += 1;
  console.log("Stubbed KimberleyNotesGate → return null");
} else {
  // Ensure name resolves if a mount somehow remains
  const anchor = src.search(/function\s+KimberleyNotesPanel\s*\(/);
  if (anchor >= 0) {
    src = src.slice(0, anchor) + gateStub + "\n" + src.slice(anchor);
    n += 1;
    console.log("Inserted stub KimberleyNotesGate");
  }
}

if (replaceBlock("function", "KimberleyNotesPanel", panelStub)) {
  n += 1;
  console.log("Stubbed KimberleyNotesPanel → return null");
} else {
  const anchor = src.search(/function\s+ResumeUploadPanel\s*\(/);
  if (anchor >= 0) {
    src = src.slice(0, anchor) + panelStub + "\n" + src.slice(anchor);
    n += 1;
    console.log("Inserted stub KimberleyNotesPanel");
  }
}

// Remove kimberley nav (both label spellings)
if (/id:\s*["']kimberley["']/.test(src)) {
  src = src.replace(
    /\s*,?\s*\{\s*id:\s*["']kimberley["']\s*,\s*label:\s*["']Kimberley(?:'s)? Notes["']\s*\}/g,
    "",
  );
  src = src.replace(/,\s*,/g, ",");
  n += 1;
  console.log("Removed kimberley nav id");
}

// Strip leftover EMERGENCY Kimberley lines
src = src
  .split("\n")
  .filter((line) => !(line.includes("EMERGENCY") && line.includes("Kimberley") && line.includes("{")))
  .join("\n");

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

Then Railway → Redeploy. ATS should load again (Notes stays off until we re-enable safely).
`);
