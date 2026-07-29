#!/usr/bin/env node
/**
 * Safely re-enable Kimberley's Notes after emergency disable.
 *
 * Guards:
 * - plain JSX snippet (no escaped backticks, no useEffect, no setState-during-render)
 * - panel is a SIBLING of AgentPanel (never nested in its props)
 * - Error boundary wrapper so Notes failures can't white-screen the whole ATS
 *
 * Usage (one line):
 *   node gina-express/frontend/reenable-kimberley-notes.mjs /Users/jameslyday/lyday-gina-backend/gina-backend/frontend/src/App.jsx
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
    "Usage: node reenable-kimberley-notes.mjs /Users/jameslyday/lyday-gina-backend/gina-backend/frontend/src/App.jsx",
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

const GATE = `
class KimberleyNotesGate extends Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(error) {
    return { err: String((error && error.message) || error || "Unknown error") };
  }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 16, color: "#9B2C2C", fontSize: 13 }}>
          Kimberley's Notes hit an error and was isolated so the rest of the ATS stays up:{" "}
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

// 1) Ensure Component is imported from react
if (/from\s*["']react["']/.test(src)) {
  if (!/\bComponent\b/.test(src.match(/import\s*\{[^}]*\}\s*from\s*["']react["']/)?.[0] || "")) {
    src = src.replace(
      /import\s*\{([^}]*)\}\s*from\s*["']react["']/,
      (full, inner) => {
        if (/\bComponent\b/.test(inner)) return full;
        return `import { ${inner.replace(/\s+$/, "")}, Component } from "react"`;
      },
    );
    console.log("Added Component to react import");
  }
} else {
  console.error("Could not find react import — add Component manually");
  process.exit(2);
}

// 2) Strip emergency leftovers / old kimberley renders
src = src.replace(/\n[ \t]*\{\/\* EMERGENCY[\s\S]*?\*\/\}\s*\n/g, "\n");
src = src.replace(/\n[ \t]*\{false && null \/\* EMERGENCY[\s\S]*?\*\/\}\s*\n/g, "\n");
src = src.replace(/\n[ \t]*\{view === "kimberley" && <KimberleyNotes(?:Panel|Gate) \/>\}\s*\n/g, "\n");

// 3) Replace existing KimberleyNotesPanel (+ optional gate) with clean panel + gate
function replaceFunction(name, replacement) {
  const re = new RegExp(`function\\s+${name}\\s*\\(`);
  const classRe = new RegExp(`class\\s+${name}\\s+extends\\s+Component`);
  let start = src.search(re);
  let isClass = false;
  if (start < 0) {
    start = src.search(classRe);
    isClass = start >= 0;
  }
  if (start < 0) return false;
  const after = src.slice(start + 1);
  const endRel = after.search(
    /\n\s*(?:function\s+|class\s+)(ResumeUploadPanel|CandidateTracker|AgentPanel|MariaView|App|GinaBriefingCard|KimberleyNotesPanel|KimberleyNotesGate)\b/,
  );
  if (endRel < 0) {
    // brace match
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
    if (end < 0) return false;
    src = src.slice(0, start) + replacement + "\n" + src.slice(end);
    return true;
  }
  const end = start + 1 + endRel;
  src = src.slice(0, start) + replacement + "\n" + src.slice(end);
  return true;
}

if (src.includes("function KimberleyNotesPanel") || src.includes("class KimberleyNotesGate")) {
  replaceFunction("KimberleyNotesGate", "");
  replaceFunction("KimberleyNotesPanel", PANEL + "\n" + GATE);
  console.log("Replaced KimberleyNotesPanel (+ gate)");
} else {
  const anchor = src.search(/function\s+ResumeUploadPanel\s*\(/);
  if (anchor < 0) {
    console.error("No ResumeUploadPanel anchor");
    process.exit(2);
  }
  src = src.slice(0, anchor) + PANEL + "\n" + GATE + "\n" + src.slice(anchor);
  console.log("Inserted KimberleyNotesPanel + gate");
}

// 4) Nav item next to Agent (only once)
if (!/id:\s*["']kimberley["']/.test(src)) {
  if (/label:\s*["']Agent["']/.test(src)) {
    src = src.replace(
      /(\{\s*id:\s*["']agent["']\s*,\s*label:\s*["']Agent["']\s*\})/,
      '$1,\n  { id: "kimberley", label: "Kimberley\\\'s Notes" }',
    );
    // fallback if id:agent pattern differs
    if (!/id:\s*["']kimberley["']/.test(src)) {
      src = src.replace(
        /(label:\s*["']Agent["']\s*\})/,
        '$1,\n  { id: "kimberley", label: "Kimberley\\\'s Notes" }',
      );
    }
    console.log("Added Kimberley's Notes nav item");
  } else {
    console.warn('Could not find Agent nav label — add { id: "kimberley", label: "Kimberley\'s Notes" } manually');
  }
}

// 5) Render gate after closed AgentPanel block
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

// 6) Hard refusals — only fail if Kimberley appears INSIDE an AgentPanel tag
const agentOpen = src.match(/<AgentPanel\b[\s\S]*?\/>/g) || [];
for (const chunk of agentOpen) {
  if (/KimberleyNotes/.test(chunk)) {
    console.error("REFUSING: Kimberley still looks nested inside AgentPanel");
    process.exit(2);
  }
}
if (/EMERGENCY disabled:/.test(src) && /KimberleyNotesPanel/.test(src)) {
  // leftover nested comment style from old emergency script
  if (/\{\/\*[^*]*\/\*/.test(src)) {
    console.error("REFUSING: nested emergency comments still present");
    process.exit(2);
  }
}
const panelBlock = src.match(
  /function\s+KimberleyNotesPanel\([\s\S]*?\n(?=class\s+KimberleyNotesGate|function\s+)/,
);
if (panelBlock && /\buseEffect\s*\(/.test(panelBlock[0])) {
  console.error("REFUSING: panel contains useEffect");
  process.exit(2);
}

fs.writeFileSync(target, src, "utf8");
console.log("Backup:", bak);
console.log("Wrote:", target);
console.log(`
Next:
  cd ~/lyday-gina-backend/gina-backend/frontend
  npm run build
  cd ~/lyday-gina-backend/gina-backend
  git add frontend/src/App.jsx
  git commit -m "Safely re-enable Kimberley Notes with error boundary"
  git push origin main

Then Railway → Redeploy.
In Gina ATS open the "Kimberley Notes" nav item and click Refresh.
`);
