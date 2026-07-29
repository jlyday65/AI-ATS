#!/usr/bin/env node
/**
 * DEPRECATED for production Gina UI.
 * Injecting a React panel/gate into App.jsx has repeatedly white-screened ATS.
 *
 * Prefer:
 *   node gina-express/frontend/reenable-kimberley-notes-iframe.mjs <App.jsx>
 *
 * This script remains for local experiments only. It refuses unless
 * ALLOW_REACT_NOTES=1 is set.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

if (process.env.ALLOW_REACT_NOTES !== "1") {
  console.error(`Refusing React Notes injection into App.jsx (causes white screens).

Use the iframe approach instead:
  node gina-express/frontend/reenable-kimberley-notes-iframe.mjs ${process.argv[2] || "<App.jsx>"}

Or set ALLOW_REACT_NOTES=1 to override (not recommended).`);
  process.exit(2);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(
  String(process.argv[2] || "").replace(/^~/, process.env.HOME || "").trim(),
);
if (!target || !fs.existsSync(target)) {
  console.error(
    "Usage: ALLOW_REACT_NOTES=1 node reenable-kimberley-notes.mjs /Users/.../frontend/src/App.jsx",
  );
  process.exit(1);
}

const snippetPath = path.join(__dirname, "KimberleyNotesPanel.snippet.jsx");
const PANEL = fs.readFileSync(snippetPath, "utf8").trim() + "\n";

if (/\buseEffect\s*\(/.test(PANEL)) {
  console.error("Refusing: snippet still contains useEffect");
  process.exit(2);
}
if (/\\`/.test(PANEL)) {
  console.error("Refusing: snippet contains escaped backticks");
  process.exit(2);
}

// Keep Gate text free of curly apostrophes that complicate patches.
const GATE = `
class KimberleyNotesGate extends React.Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(error) {
    return { err: String((error && error.message) || error || "Unknown error") };
  }
  componentDidCatch(error) {
    try {
      console.error("KimberleyNotesGate", error);
    } catch (_) {}
  }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 16, color: "#9B2C2C", fontSize: 13 }}>
          Kimberley Notes hit an error and was isolated so the rest of the ATS stays up:{" "}
          {this.state.err}
        </div>
      );
    }
    return <KimberleyNotesPanel />;
  }
}
`;

let src = fs.readFileSync(target, "utf8");
const bak = `${target}.bak-reenable-${Date.now()}`;
fs.copyFileSync(target, bak);

if (/async\s+function\s+await\s+applyAgentAction/.test(src)) {
  console.error("Refusing: App.jsx has async function await applyAgentAction — run restore-ats-ui first");
  process.exit(2);
}
if ((src.match(/const BOT_NAMES\s*=\s*new Set/g) || []).length > 1) {
  console.error("Refusing: duplicate BOT_NAMES — run fix-duplicate-bot-names first");
  process.exit(2);
}

// 1) Force default React import (required for React.Component)
const reactImport = src.match(/import\s+([^;]+)\s+from\s*["']react["']/);
if (!reactImport) {
  console.error('Refusing: no react import found');
  process.exit(2);
}
if (!/\bReact\b/.test(reactImport[1])) {
  if (/import\s*\{([^}]*)\}\s*from\s*["']react["']/.test(src)) {
    src = src.replace(
      /import\s*\{([^}]*)\}\s*from\s*["']react["']/,
      'import React, { $1 } from "react"',
    );
    console.log("Added React default import");
  } else {
    console.error("Could not add React default import automatically");
    process.exit(2);
  }
} else {
  console.log("React default import already present");
}

// 2) Strip old kimberley mounts / emergency leftovers
src = src.replace(/\n[ \t]*\{\/\* EMERGENCY[\s\S]*?\*\/\}\s*\n/g, "\n");
src = src.replace(/\n[ \t]*\{false && null \/\* EMERGENCY[\s\S]*?\*\/\}\s*\n/g, "\n");
src = src.replace(/\n[ \t]*\{view === "kimberley" && <KimberleyNotes(?:Panel|Gate)\s*\/>\}\s*\n/g, "\n");

function removeNamed(name) {
  const reFn = new RegExp(`function\\s+${name}\\s*\\(`);
  const reClass = new RegExp(`class\\s+${name}\\s+extends\\s+[\\w.]+`);
  let start = src.search(reFn);
  if (start < 0) start = src.search(reClass);
  if (start < 0) return false;
  const braceAt = src.indexOf("{", start);
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
  if (end < 0) {
    const after = src.slice(start + 1);
    const endRel = after.search(
      /\n\s*(?:function\s+|class\s+)(ResumeUploadPanel|CandidateTracker|AgentPanel|MariaView|App|GinaBriefingCard|KimberleyNotesPanel|KimberleyNotesGate)\b/,
    );
    if (endRel < 0) return false;
    end = start + 1 + endRel;
  }
  src = src.slice(0, start) + src.slice(end);
  return true;
}

// 3) Remove any existing panel/gate, then insert clean copies once
while (removeNamed("KimberleyNotesGate")) {}
while (removeNamed("KimberleyNotesPanel")) {}

const anchors = [
  /function\s+ResumeUploadPanel\s*\(/,
  /function\s+CandidateTracker\s*\(/,
  /function\s+AgentPanel\s*\(/,
  /function\s+JobsView\s*\(/,
  /export\s+default\s+function\s+App\s*\(/,
  /function\s+App\s*\(/,
];
let insertAt = -1;
for (const re of anchors) {
  insertAt = src.search(re);
  if (insertAt >= 0) break;
}
if (insertAt < 0) {
  console.error("No insert anchor found for Notes panel");
  process.exit(2);
}
src = src.slice(0, insertAt) + PANEL + "\n" + GATE + "\n" + src.slice(insertAt);
console.log("Inserted KimberleyNotesPanel + KimberleyNotesGate");

// 4) Nav — label without apostrophe (avoids quote escaping bugs)
if (!/id:\s*["']kimberley["']/.test(src)) {
  const patterns = [
    /(\{\s*id:\s*["']agent["']\s*,\s*label:\s*["']Agent["']\s*\})/,
    /(\{\s*id:\s*["']agent["']\s*,\s*label:\s*["'][^"']+["']\s*\})/,
    /(label:\s*["']Agent["']\s*\})/,
  ];
  for (const re of patterns) {
    if (re.test(src)) {
      src = src.replace(re, '$1,\n  { id: "kimberley", label: "Kimberley Notes" }');
      break;
    }
  }
  if (/id:\s*["']kimberley["']/.test(src)) {
    console.log("Added Kimberley Notes nav item");
  } else {
    console.warn(
      'Could not add nav automatically — add { id: "kimberley", label: "Kimberley Notes" } next to Agent',
    );
  }
}

// 5) Mount gate as sibling after AgentPanel (self-closing) or before Maria
if (!/view === "kimberley" && <KimberleyNotesGate/.test(src)) {
  const agentClosed =
    /(\{\s*view\s*===\s*["']agent["']\s*&&\s*<AgentPanel\b[^>]*\/>\s*\})/;
  if (agentClosed.test(src)) {
    src = src.replace(
      agentClosed,
      '$1\n        {view === "kimberley" && <KimberleyNotesGate />}',
    );
    console.log("Wired kimberley view after AgentPanel");
  } else if (/\{view === "maria" &&/.test(src)) {
    src = src.replace(
      /(\{\s*view\s*===\s*["']maria["']\s*&&)/,
      '{view === "kimberley" && <KimberleyNotesGate />}\n\n        $1',
    );
    console.log("Wired kimberley view before Maria");
  } else {
    console.error("Could not find Agent/Maria view mount point");
    process.exit(2);
  }
}

// 6) Hard refusals
const agentOpen = src.match(/<AgentPanel\b[\s\S]*?\/>/g) || [];
for (const chunk of agentOpen) {
  if (/KimberleyNotes/.test(chunk)) {
    console.error("REFUSING: Kimberley still looks nested inside AgentPanel");
    process.exit(2);
  }
}
if (/class\s+KimberleyNotesGate\s+extends\s+Component\b/.test(src)) {
  console.error("REFUSING: Gate extends bare Component (must be React.Component)");
  process.exit(2);
}
if (!/class\s+KimberleyNotesGate\s+extends\s+React\.Component\b/.test(src)) {
  console.error("REFUSING: Gate missing extends React.Component");
  process.exit(2);
}
if (!/import\s+React\b|import\s+React,/.test(src)) {
  console.error("REFUSING: React default import missing after patch");
  process.exit(2);
}
const panelCount = (src.match(/function\s+KimberleyNotesPanel\s*\(/g) || []).length;
const gateCount = (src.match(/class\s+KimberleyNotesGate\s+extends/g) || []).length;
if (panelCount !== 1 || gateCount !== 1) {
  console.error(`REFUSING: expected 1 panel + 1 gate, found ${panelCount}/${gateCount}`);
  process.exit(2);
}
if (!/view === "kimberley" && <KimberleyNotesGate/.test(src)) {
  console.error("REFUSING: kimberley view mount missing");
  process.exit(2);
}

fs.writeFileSync(target, src, "utf8");
console.log("Backup:", bak);
console.log("Wrote:", target);
console.log(`
VERIFY ORDER (important):
  1) cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  2) If build fails → restore backup:
       cp "${bak}" "${target}"
  3) git add frontend/src/App.jsx
     git commit -m "Re-enable Kimberley Notes via React.Component gate"
     git push origin main
  4) Railway Redeploy
  5) Hard refresh — confirm BOARD still loads first
  6) Open "Kimberley Notes" → Refresh

If white screen returns:
  node gina-express/frontend/restore-ats-ui.mjs ${target}
`);
