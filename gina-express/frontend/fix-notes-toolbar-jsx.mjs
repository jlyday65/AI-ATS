#!/usr/bin/env node
/**
 * Repair App.jsx when Notes toolbar insert left "<<a" after Add candidate.
 *
 * Usage:
 *   node gina-express/frontend/fix-notes-toolbar-jsx.mjs \
 *     /Users/jameslyday/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 */

import fs from "fs";
import path from "path";

const appPath = path.resolve(
  String(process.argv[2] || "").replace(/^~/, process.env.HOME || "").trim(),
);
if (!appPath || !fs.existsSync(appPath)) {
  console.error(
    "Usage: node fix-notes-toolbar-jsx.mjs /Users/.../frontend/src/App.jsx",
  );
  process.exit(1);
}

let src = fs.readFileSync(appPath, "utf8");
const bak = `${appPath}.bak-fix-notes-toolbar-${Date.now()}`;
fs.copyFileSync(appPath, bak);

const BTN = `<a
          data-kimberley-notes-link="1"
          href="/notes"
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            fontSize: 13,
            padding: "6px 10px",
            marginLeft: 8,
            borderRadius: 8,
            border: "1px solid #E6E2D6",
            background: "#fff",
            color: "#2C2A24",
            textDecoration: "none",
            cursor: "pointer",
          }}
        >
          Kimberley Notes
        </a>`;

const needle = "Add candidate";
const idx = src.search(/Add candidate/i);
if (idx < 0) {
  console.error("Could not find Add candidate");
  process.exit(2);
}

const endNeedle = idx + needle.length;
let after = src.slice(endNeedle);

// Drop broken/good Notes <a>…</a> immediately after Add candidate
after = after.replace(/^\s*<+a\b[\s\S]*?<\/a>/i, "");

// Ensure </button> comes next
if (!/^\s*<\/button>/i.test(after)) {
  after = "</button>" + after;
}

src = src.slice(0, endNeedle) + after;

// Remove any other Notes links elsewhere
src = src.replace(/<<+/g, "<");
src = src.replace(
  /\s*<a\b[\s\S]*?data-kimberley-notes-link\s*=\s*["']1["'][\s\S]*?<\/a>/gi,
  "",
);

// Insert one Notes link after the Add candidate </button>
const re = /(Add candidate\s*<\/button>)/i;
if (!re.test(src)) {
  console.error("Add candidate </button> still missing after repair");
  console.error(src.slice(Math.max(0, idx - 80), idx + 160));
  process.exit(2);
}
src = src.replace(re, `$1\n              ${BTN}`);

if (/<<a\b/.test(src)) {
  console.error("REFUSING: <<a still present");
  process.exit(2);
}
if ((src.match(/data-kimberley-notes-link=/g) || []).length !== 1) {
  console.error(
    "REFUSING: expected 1 Notes link, found",
    (src.match(/data-kimberley-notes-link=/g) || []).length,
  );
  process.exit(2);
}

fs.writeFileSync(appPath, src, "utf8");
console.log("Repaired Add candidate and inserted Kimberley Notes after it");
console.log("Backup:", bak);
console.log("Wrote:", appPath);
console.log(`
Next:
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend
  git add gina-backend/frontend/src/App.jsx
  git commit -m "Fix Notes toolbar link after Add candidate"
  git push origin main
`);
