#!/usr/bin/env node
/**
 * Repair App.jsx after a bad Kimberley Notes inject broke AgentPanel JSX.
 *
 * Broken (Vite: Expected "..." but found "view"):
 *   {view === "agent" && <AgentPanel applyAgentAction={applyAgentAction}
 *     {view === "kimberley" || tab === "kimberley" || activeView === "kimberley" ? <KimberleyNotesPanel /> : null} />}
 *
 * Fixed:
 *   {view === "agent" && <AgentPanel applyAgentAction={applyAgentAction} />}
 *   {view === "kimberley" && <KimberleyNotesPanel />}
 *
 * Usage:
 *   node repair-kimberley-notes-jsx.mjs \
 *     ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 */

import fs from "fs";
import path from "path";

const target = path.resolve(
  String(process.argv[2] || "").replace(/^~/, process.env.HOME || ""),
);
if (!target || !fs.existsSync(target)) {
  console.error(
    "Usage: node repair-kimberley-notes-jsx.mjs /Users/.../frontend/src/App.jsx",
  );
  process.exit(1);
}

let src = fs.readFileSync(target, "utf8");
const bak = `${target}.bak-repair-kimberley-${Date.now()}`;
fs.copyFileSync(target, bak);

const KIMBERLEY = '{view === "kimberley" && <KimberleyNotesPanel />}';
let fixed = 0;

function replaceAll(re, replacer) {
  const next = src.replace(re, (...args) => {
    fixed += 1;
    return replacer(...args);
  });
  if (next !== src) src = next;
}

// Multiline AgentPanel with nested kimberley ternary before self-close
replaceAll(
  /\{\s*view\s*===\s*"agent"\s*&&\s*<AgentPanel\b([^>\n]*)\r?\n\s*\{\s*view\s*===\s*"kimberley"\s*\|\|[\s\S]*?<KimberleyNotesPanel\s*\/>\s*:\s*null\s*\}\s*\/>\s*\}/g,
  (_, props) => {
    const p = String(props || "").trim();
    const propBit = p ? ` ${p}` : "";
    return `{view === "agent" && <AgentPanel${propBit} />}\n        ${KIMBERLEY}`;
  },
);

// Single-line variant
replaceAll(
  /\{\s*view\s*===\s*"agent"\s*&&\s*<AgentPanel\b([^>]*)\{\s*view\s*===\s*"kimberley"[\s\S]*?<KimberleyNotesPanel\s*\/>\s*:\s*null\s*\}\s*\/>\s*\}/g,
  (_, props) => {
    const p = String(props || "").replace(/\s+$/, "").trim();
    const propBit = p ? ` ${p}` : "";
    return `{view === "agent" && <AgentPanel${propBit} />}\n        ${KIMBERLEY}`;
  },
);

// Exact text from the user's build error (most reliable)
const EXACT_BROKEN = `{view === "agent" && <AgentPanel applyAgentAction={applyAgentAction}
        {view === "kimberley" || tab === "kimberley" || activeView === "kimberley" ? <KimberleyNotesPanel /> : null} />}`;
const EXACT_FIXED = `{view === "agent" && <AgentPanel applyAgentAction={applyAgentAction} />}
        ${KIMBERLEY}`;
if (src.includes(EXACT_BROKEN)) {
  src = src.replace(EXACT_BROKEN, EXACT_FIXED);
  fixed += 1;
}

// Fix half-repaired agent line missing closing brace
replaceAll(
  /(\{\s*view\s*===\s*"agent"\s*&&\s*<AgentPanel\b[^>]*\/>)\s*\n(?!\s*\})/g,
  "$1}\n",
);

// Ensure kimberley sibling exists once
if (!/\{\s*view\s*===\s*"kimberley"\s*&&\s*<KimberleyNotesPanel/.test(src)) {
  if (/\{\s*view\s*===\s*"agent"\s*&&\s*<AgentPanel\b[^>]*\/>\s*\}/.test(src)) {
    src = src.replace(
      /(\{\s*view\s*===\s*"agent"\s*&&\s*<AgentPanel\b[^>]*\/>\s*\})/,
      `$1\n        ${KIMBERLEY}`,
    );
    fixed += 1;
  } else if (/\{\s*view\s*===\s*"maria"\s*&&/.test(src)) {
    src = src.replace(
      /(\{\s*view\s*===\s*"maria"\s*&&)/,
      `${KIMBERLEY}\n\n        $1`,
    );
    fixed += 1;
  }
}

// Deduplicate
const kimMatches =
  src.match(/\{view === "kimberley" && <KimberleyNotesPanel \/>\}/g) || [];
if (kimMatches.length > 1) {
  let seen = 0;
  src = src.replace(
    /\{view === "kimberley" && <KimberleyNotesPanel \/>\}/g,
    () => {
      seen += 1;
      return seen === 1 ? KIMBERLEY : "";
    },
  );
}

if (/label:\s*["']Agent["']/.test(src) && !/id:\s*["']kimberley["']/.test(src)) {
  src = src.replace(
    /(label:\s*["']Agent["'][^}]*\})/,
    '$1,\n  { id: "kimberley", label: "Kimberley\'s Notes" }',
  );
  fixed += 1;
}

fs.writeFileSync(target, src, "utf8");
console.log("Backup:", bak);
console.log(fixed ? `Repaired App.jsx (${fixed} fix(es))` : "No known broken pattern matched");

const lines = src.split("\n");
for (let i = 0; i < lines.length; i += 1) {
  if (/AgentPanel|kimberley/i.test(lines[i])) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
}

console.log(`
Next:
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
`);
