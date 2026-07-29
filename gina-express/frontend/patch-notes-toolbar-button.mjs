#!/usr/bin/env node
/**
 * Place "Kimberley Notes" AFTER the Add candidate </button>
 * (never inside the button — that produced <<a and broke the build).
 *
 * Usage:
 *   node gina-express/frontend/patch-notes-toolbar-button.mjs \
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
    "Usage: node patch-notes-toolbar-button.mjs /Users/.../frontend/src/App.jsx",
  );
  process.exit(1);
}

// If already broken from a prior run, repair first
const cur = fs.readFileSync(target, "utf8");
if (/<<a\b/.test(cur) || /Add candidate\s*<a\b[^>]*data-kimberley-notes-link/i.test(cur)) {
  console.log("Detected broken Notes insert — running repair…");
  const fix = path.join(__dirname, "fix-notes-toolbar-jsx.mjs");
  const r = spawnSync(process.execPath, [fix, target], { stdio: "inherit" });
  process.exit(r.status || 0);
}

let src = cur;
const bak = `${target}.bak-notes-toolbar-${Date.now()}`;
fs.copyFileSync(target, bak);

// Remove prior Notes links
src = src.replace(
  /\s*<a\b[^>]*data-kimberley-notes-link=["']1["'][^>]*>[\s\S]*?<\/a>/g,
  "",
);

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

const re =
  /(<button\b[^>]*>\s*<Plus\b[^>]*\/>\s*Add candidate\s*<\/button>)/i;
if (re.test(src)) {
  src = src.replace(re, `$1\n              ${BTN}`);
  console.log("Inserted Kimberley Notes after Add candidate </button>");
} else {
  const idx = src.search(/Add candidate/i);
  if (idx < 0) {
    console.error("Could not find Add candidate");
    process.exit(2);
  }
  const closeRel = src.slice(idx, idx + 240).search(/<\/button>/i);
  if (closeRel < 0) {
    console.error("Could not find </button> after Add candidate");
    process.exit(2);
  }
  const at = idx + closeRel + "</button>".length;
  src = src.slice(0, at) + `\n              ${BTN}` + src.slice(at);
  console.log("Inserted Kimberley Notes after nearby </button>");
}

if (/<<a\b/.test(src)) {
  console.error("REFUSING: would write <<a");
  process.exit(2);
}
if ((src.match(/data-kimberley-notes-link=/g) || []).length !== 1) {
  console.error("REFUSING: expected exactly 1 Notes link");
  process.exit(2);
}

fs.writeFileSync(target, src, "utf8");
console.log("Backup:", bak);
console.log("Wrote:", target);
console.log(`
Next:
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend
  git add gina-backend/frontend/src/App.jsx
  git commit -m "Add Kimberley Notes next to Add candidate"
  git push origin main
`);
