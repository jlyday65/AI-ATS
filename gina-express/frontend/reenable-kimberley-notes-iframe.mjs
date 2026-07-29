#!/usr/bin/env node
/**
 * Re-enable Kimberley Notes WITHOUT putting React panel/gate code in App.jsx.
 *
 * White-screen root cause: any Notes React class/panel injected into App.jsx can
 * crash the whole ATS module on load. This approach only adds:
 *   - a nav item
 *   - an iframe mount to /kimberley-notes.html (vanilla JS page)
 * and copies the static HTML into frontend/public/.
 *
 * Usage:
 *   node gina-express/frontend/reenable-kimberley-notes-iframe.mjs \
 *     /Users/jameslyday/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(
  String(process.argv[2] || "").replace(/^~/, process.env.HOME || "").trim(),
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

// 0) First strip any previous React Notes panel/gate from App.jsx
const restore = path.join(__dirname, "restore-ats-ui.mjs");
console.log("Stripping any React Notes code from App.jsx first…");
const stripped = spawnSync(process.execPath, [restore, target], { stdio: "inherit" });
if (stripped.status !== 0) {
  console.error("restore-ats-ui failed — fix App.jsx before continuing");
  process.exit(stripped.status || 2);
}

let src = fs.readFileSync(target, "utf8");
const bak = `${target}.bak-iframe-notes-${Date.now()}`;
fs.copyFileSync(target, bak);

// Copy static page into Vite public/ so /kimberley-notes.html is served
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

// Remove any leftover mounts
src = src.replace(
  /\n[ \t]*\{view === "kimberley" && <KimberleyNotes(?:Panel|Gate)\s*\/>\}\s*\n/g,
  "\n",
);
src = src.replace(
  /\n[ \t]*\{view === "kimberley" && \([\s\S]*?<iframe[\s\S]*?Kimberley Notes[\s\S]*?\)\}\s*\n/g,
  "\n",
);

// Nav
if (!/id:\s*["']kimberley["']/.test(src)) {
  const patterns = [
    /(\{\s*id:\s*["']agent["']\s*,\s*label:\s*["']Agent["']\s*\})/,
    /(\{\s*id:\s*["']agent["']\s*,\s*label:\s*["'][^"']+["']\s*\})/,
    /(label:\s*["']Agent["']\s*\})/,
  ];
  let added = false;
  for (const re of patterns) {
    if (re.test(src)) {
      src = src.replace(re, '$1,\n  { id: "kimberley", label: "Kimberley Notes" }');
      added = true;
      break;
    }
  }
  console.log(added ? "Added Kimberley Notes nav item" : "WARN: add nav item manually");
}

// Mount iframe after AgentPanel or before Maria
if (!/view === "kimberley" && \([\s\S]*iframe[\s\S]*kimberley-notes\.html/.test(src)) {
  const agentClosed =
    /(\{\s*view\s*===\s*["']agent["']\s*&&\s*<AgentPanel\b[^>]*\/>\s*\})/;
  if (agentClosed.test(src)) {
    src = src.replace(agentClosed, `$1\n        ${iframeMount}`);
    console.log("Wired iframe Notes after AgentPanel");
  } else if (/\{view === "maria" &&/.test(src)) {
    src = src.replace(
      /(\{\s*view\s*===\s*["']maria["']\s*&&)/,
      `${iframeMount}\n\n        $1`,
    );
    console.log("Wired iframe Notes before Maria");
  } else {
    console.error("Could not find Agent/Maria mount point");
    process.exit(2);
  }
}

// Refuse if React Notes symbols reappeared
if (/KimberleyNotes(Panel|Gate)/.test(src)) {
  console.error("REFUSING: React KimberleyNotes symbols still in App.jsx");
  process.exit(2);
}
if (!/kimberley-notes\.html/.test(src)) {
  console.error("REFUSING: iframe mount missing");
  process.exit(2);
}

fs.writeFileSync(target, src, "utf8");
console.log("Backup:", bak);
console.log("Wrote:", target);
console.log(`
Next:
  cd ${frontendDir} && npm run build
  cd ${path.resolve(frontendDir, "..")}
  git add frontend/src/App.jsx frontend/public/kimberley-notes.html
  git commit -m "Kimberley Notes via standalone iframe page (no App.jsx React panel)"
  git push origin main

Railway Redeploy → hard refresh → confirm BOARD loads → open Kimberley Notes.
`);
