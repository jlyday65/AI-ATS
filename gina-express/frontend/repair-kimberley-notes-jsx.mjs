#!/usr/bin/env node
/**
 * Repair App.jsx after Kimberley Notes patch corruption.
 *
 * Fixes:
 * 1) Nested inject inside <AgentPanel ...>
 * 2) Escaped backticks (\`) / truncated KimberleyNotesPanel function
 *
 * Usage (ONE line — do not put a backslash before the path):
 *   node gina-express/frontend/repair-kimberley-notes-jsx.mjs /Users/jameslyday/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const target = path.resolve(
  String(process.argv[2] || "").replace(/^~/, process.env.HOME || "").trim(),
);
if (!target || !fs.existsSync(target)) {
  console.error(
    "Usage: node repair-kimberley-notes-jsx.mjs /Users/jameslyday/lyday-gina-backend/gina-backend/frontend/src/App.jsx",
  );
  console.error("Do not put a backslash before the path.");
  process.exit(1);
}

const snippetPath = path.join(__dirname, "KimberleyNotesPanel.snippet.jsx");
if (!fs.existsSync(snippetPath)) {
  console.error("Missing snippet:", snippetPath);
  process.exit(1);
}
const PANEL = fs.readFileSync(snippetPath, "utf8").trim() + "\n";

let src = fs.readFileSync(target, "utf8");
const bak = `${target}.bak-repair-kimberley-${Date.now()}`;
fs.copyFileSync(target, bak);

let fixed = 0;

function replaceAll(re, replacer) {
  const next = src.replace(re, (...args) => {
    fixed += 1;
    return typeof replacer === "function" ? replacer(...args) : replacer;
  });
  if (next !== src) src = next;
}

// --- 1) Replace any KimberleyNotesPanel function block (broken or not) ---
const panelStart = src.search(/function\s+KimberleyNotesPanel\s*\(/);
if (panelStart >= 0) {
  // End at next top-level-ish function after the panel, or before ResumeUploadPanel / CandidateTracker
  const after = src.slice(panelStart + 1);
  const endRel = after.search(
    /\nfunction\s+(ResumeUploadPanel|CandidateTracker|AgentPanel|MariaView|App|GinaBriefingCard)\b/,
  );
  if (endRel >= 0) {
    const end = panelStart + 1 + endRel;
    src = src.slice(0, panelStart) + PANEL + "\n" + src.slice(end);
    fixed += 1;
    console.log("Replaced KimberleyNotesPanel function with clean snippet");
  } else {
    // Brace-match from function start
    const braceAt = src.indexOf("{", panelStart);
    let depth = 0;
    let end = -1;
    for (let i = braceAt; i < src.length; i += 1) {
      if (src[i] === "{") depth += 1;
      else if (src[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end > panelStart) {
      src = src.slice(0, panelStart) + PANEL + "\n" + src.slice(end);
      fixed += 1;
      console.log("Replaced KimberleyNotesPanel via brace match");
    }
  }
} else if (/\\`\?agent=|Kimberley's Notes/.test(src) || /\\\$\{encodeURIComponent/.test(src)) {
  // Truncated mid-panel with no function end — find from "function KimberleyNotesPanel" OR orphaned load() fragment
  const orphan = src.search(/const q = filter === "all"/);
  const fn = src.search(/function\s+KimberleyNotesPanel/);
  const start = fn >= 0 ? fn : orphan;
  if (start >= 0) {
    const endRel = src.slice(start).search(/\nfunction\s+\w+/);
    const end = endRel >= 0 ? start + endRel : start;
    // Walk backward to include function KimberleyNotesPanel if orphaned
    let realStart = start;
    const back = src.lastIndexOf("function KimberleyNotesPanel", start);
    if (back >= 0 && start - back < 800) realStart = back;
    src = src.slice(0, realStart) + PANEL + "\n" + src.slice(end > realStart ? end : realStart);
    fixed += 1;
    console.log("Repaired truncated/escaped KimberleyNotesPanel fragment");
  }
} else {
  // Insert clean panel before ResumeUploadPanel / CandidateTracker
  const anchor = src.search(
    /function\s+(ResumeUploadPanel|CandidateTracker|App)\b/,
  );
  if (anchor >= 0) {
    src = src.slice(0, anchor) + PANEL + "\n" + src.slice(anchor);
    fixed += 1;
    console.log("Inserted clean KimberleyNotesPanel");
  }
}

// --- 2) Fix nested AgentPanel inject ---
replaceAll(
  /\{\s*view\s*===\s*"agent"\s*&&\s*<AgentPanel\b([^>\n]*)\r?\n\s*\{\s*view\s*===\s*"kimberley"[\s\S]*?<KimberleyNotesPanel\s*\/>\s*:\s*null\s*\}\s*\/>\s*\}/g,
  (_, props) => {
    const p = String(props || "").trim();
    const propBit = p ? ` ${p}` : "";
    return `{view === "agent" && <AgentPanel${propBit} />}\n        {view === "kimberley" && <KimberleyNotesPanel />}`;
  },
);

const EXACT_BROKEN = `{view === "agent" && <AgentPanel applyAgentAction={applyAgentAction}
        {view === "kimberley" || tab === "kimberley" || activeView === "kimberley" ? <KimberleyNotesPanel /> : null} />}`;
const EXACT_FIXED = `{view === "agent" && <AgentPanel applyAgentAction={applyAgentAction} />}
        {view === "kimberley" && <KimberleyNotesPanel />}`;
if (src.includes(EXACT_BROKEN)) {
  src = src.replace(EXACT_BROKEN, EXACT_FIXED);
  fixed += 1;
}

// Half-closed agent line
replaceAll(
  /(\{\s*view\s*===\s*"agent"\s*&&\s*<AgentPanel\b[^>]*\/>)\s*\n(?!\s*\})/g,
  "$1}\n",
);

// Ensure kimberley view sibling
if (!/\{\s*view\s*===\s*"kimberley"\s*&&\s*<KimberleyNotesPanel\s*\/>/.test(src)) {
  if (/\{\s*view\s*===\s*"agent"\s*&&\s*<AgentPanel\b[^>]*\/>\s*\}/.test(src)) {
    src = src.replace(
      /(\{\s*view\s*===\s*"agent"\s*&&\s*<AgentPanel\b[^>]*\/>\s*\})/,
      `$1\n        {view === "kimberley" && <KimberleyNotesPanel />}`,
    );
    fixed += 1;
  } else if (/\{\s*view\s*===\s*"maria"\s*&&/.test(src)) {
    src = src.replace(
      /(\{\s*view\s*===\s*"maria"\s*&&)/,
      `{view === "kimberley" && <KimberleyNotesPanel />}\n\n        $1`,
    );
    fixed += 1;
  }
}

// Strip leftover escaped-backtick lines if any remain
if (/\\`/.test(src) && /KimberleyNotesPanel|encodeURIComponent\(filter\)/.test(src)) {
  console.warn("WARNING: escaped backticks still present somewhere — search App.jsx for \\`");
}

if (/label:\s*["']Agent["']/.test(src) && !/id:\s*["']kimberley["']/.test(src)) {
  src = src.replace(
    /(label:\s*["']Agent["'][^}]*\})/,
    '$1,\n  { id: "kimberley", label: "Kimberley\'s Notes" }',
  );
  fixed += 1;
}

// Final sanity: panel must not contain literal \ `
if (/function\s+KimberleyNotesPanel[\s\S]{0,400}\\`/.test(src)) {
  console.error("FAILED: KimberleyNotesPanel still has escaped backticks");
  process.exit(2);
}

fs.writeFileSync(target, src, "utf8");
console.log("Backup:", bak);
console.log(fixed ? `Repaired App.jsx (${fixed} fix(es))` : "No changes needed");
console.log("Wrote:", target);
console.log(`
Next (copy-paste these as separate commands):
  cd ~/lyday-gina-backend/gina-backend/frontend
  npm run build
`);
