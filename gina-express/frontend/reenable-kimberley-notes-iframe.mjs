#!/usr/bin/env node
/**
 * Re-enable Kimberley Notes WITHOUT putting React panel/gate code in App.jsx.
 *
 * Adds only:
 *   - nav item { id: "kimberley", label: "Kimberley Notes" }
 *   - iframe mount to /kimberley-notes.html
 * and copies the static HTML into frontend/public/.
 *
 * Usage:
 *   node gina-express/frontend/reenable-kimberley-notes-iframe.mjs \
 *     /Users/jameslyday/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 *
 * Options:
 *   --strip-first   run restore-ats-ui first (only if old React Notes code is present)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2).filter((a) => a && !a.startsWith("--"));
const stripFirst = process.argv.includes("--strip-first");
const target = path.resolve(
  String(args[0] || "").replace(/^~/, process.env.HOME || "").trim(),
);
if (!target || !fs.existsSync(target)) {
  console.error(
    "Usage: node reenable-kimberley-notes-iframe.mjs /Users/.../frontend/src/App.jsx",
  );
  process.exit(1);
}

const frontendDir = path.resolve(path.dirname(target), "..");
const publicDir = path.join(frontendDir, "public");
const htmlSrc = path.join(__dirname, "kimberley-notes.html");
if (!fs.existsSync(htmlSrc)) {
  console.error("Missing", htmlSrc);
  process.exit(2);
}

let src = fs.readFileSync(target, "utf8");

// Only strip if old React Notes symbols exist (or user forced --strip-first)
const hasReactNotes = /KimberleyNotes(Gate|Panel)/.test(src);
if (hasReactNotes || stripFirst) {
  console.log("Stripping React Notes code from App.jsx…");
  const restore = path.join(__dirname, "restore-ats-ui.mjs");
  const stripped = spawnSync(process.execPath, [restore, target], {
    stdio: "inherit",
  });
  if (stripped.status !== 0) {
    console.error("restore-ats-ui failed — fix App.jsx before continuing");
    process.exit(stripped.status || 2);
  }
  src = fs.readFileSync(target, "utf8");
} else {
  console.log("No React Notes panel/gate found — leaving App.jsx structure intact");
}

const bak = `${target}.bak-iframe-notes-${Date.now()}`;
fs.copyFileSync(target, bak);

fs.mkdirSync(publicDir, { recursive: true });
const htmlDest = path.join(publicDir, "kimberley-notes.html");
fs.copyFileSync(htmlSrc, htmlDest);
console.log("Wrote", htmlDest);

const iframeMount = `{view === "kimberley" && (
          <iframe
            title="Kimberley Notes"
            src="/kimberley-notes.html"
            style={{ border: 0, width: "100%", minHeight: "75vh", background: "#f7f4ec" }}
          />
        )}`;

// Remove leftover mounts
src = src.replace(
  /\n[ \t]*\{view === "kimberley" && <KimberleyNotes(?:Panel|Gate)\s*\/>\}\s*\n/g,
  "\n",
);
src = src.replace(
  /\n[ \t]*\{view === "kimberley" && \([\s\S]*?<iframe[\s\S]*?kimberley-notes\.html[\s\S]*?\)\}\s*\n/g,
  "\n",
);

// Nav — try several common Gina patterns
if (!/id:\s*["']kimberley["']/.test(src)) {
  const patterns = [
    /(\{\s*id:\s*["']agent["']\s*,\s*label:\s*["']Agent["']\s*\})/,
    /(\{\s*id:\s*["']agent["']\s*,\s*label:\s*["'][^"']+["']\s*\})/,
    /(\{\s*id:\s*["']board["']\s*,\s*label:\s*["'][^"']+["']\s*\})/,
    /(label:\s*["']Agent["']\s*\})/,
  ];
  let added = false;
  for (const re of patterns) {
    if (re.test(src)) {
      src = src.replace(re, '$1,\n  { id: "kimberley", label: "Kimberley Notes" }');
      added = /id:\s*["']kimberley["']/.test(src);
      if (added) break;
    }
  }
  if (added) console.log("Added Kimberley Notes nav item");
  else {
    console.warn(`
WARN: could not find Agent nav automatically.
Add this next to your other nav items in App.jsx:
  { id: "kimberley", label: "Kimberley Notes" }
`);
  }
} else {
  console.log("Kimberley Notes nav already present");
}

// Mount iframe
if (!/kimberley-notes\.html/.test(src)) {
  const agentClosed =
    /(\{\s*view\s*===\s*["']agent["']\s*&&\s*<AgentPanel\b[^>]*\/>\s*\})/;
  const boardClosed =
    /(\{\s*view\s*===\s*["']board["']\s*&&[\s\S]*?\}\s*\})/;
  if (agentClosed.test(src)) {
    src = src.replace(agentClosed, `$1\n        ${iframeMount}`);
    console.log("Wired iframe Notes after AgentPanel");
  } else if (/\{view === "maria" &&/.test(src)) {
    src = src.replace(
      /(\{\s*view\s*===\s*["']maria["']\s*&&)/,
      `${iframeMount}\n\n        $1`,
    );
    console.log("Wired iframe Notes before Maria");
  } else if (/\{view === "agent" &&/.test(src)) {
    src = src.replace(
      /(\{\s*view\s*===\s*["']agent["']\s*&&)/,
      `${iframeMount}\n\n        $1`,
    );
    console.log("Wired iframe Notes before agent view");
  } else {
    console.error("Could not find a view mount point (agent/maria)");
    console.error("Backup left at", bak);
    process.exit(2);
  }
} else {
  console.log("iframe Notes mount already present");
}

if (/KimberleyNotes(Panel|Gate)/.test(src)) {
  console.error("REFUSING: React KimberleyNotes symbols still in App.jsx");
  process.exit(2);
}
if (!/kimberley-notes\.html/.test(src)) {
  console.error("REFUSING: iframe mount missing");
  process.exit(2);
}
if (!/id:\s*["']kimberley["']/.test(src)) {
  console.error("REFUSING: nav id kimberley missing — add it manually then rerun build");
  fs.writeFileSync(target, src, "utf8");
  process.exit(2);
}

fs.writeFileSync(target, src, "utf8");
console.log("Backup:", bak);
console.log("Wrote:", target);

// Prove what was added
const navOk = /id:\s*["']kimberley["']/.test(src);
const iframeOk = /kimberley-notes\.html/.test(src);
const htmlOk = fs.existsSync(htmlDest);
console.log("Check nav:", navOk);
console.log("Check iframe mount:", iframeOk);
console.log("Check public HTML:", htmlOk, htmlDest);

console.log(`
Next (one line each — no backslash):
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend
  git add gina-backend/frontend/src/App.jsx
  git add gina-backend/frontend/public/kimberley-notes.html
  git status
  git commit -m "Add Kimberley Notes nav via iframe page"
  git push origin main

Railway Redeploy → hard refresh → look for "Kimberley Notes" in the nav.
`);
