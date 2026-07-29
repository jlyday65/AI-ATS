#!/usr/bin/env node
/**
 * Repair App.jsx when Notes toolbar insert left:
 *   <Plus /> Add candidate
 *   <<a data-kimberley-notes-link ...>Kimberley Notes</a>
 * (missing </button>)
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

// Remove ALL Notes links first
src = src.replace(
  /\s*<a\b[^>]*data-kimberley-notes-link=["']1["'][^>]*>[\s\S]*?<\/a>/gi,
  "",
);
// Fix doubled angle brackets left behind
src = src.replace(/<<+/g, "<");

// Restore Add candidate button close
src = src.replace(
  /(<button\b[^>]*>\s*<Plus\b[^>]*\/>\s*Add candidate)\s*(?:\/button>)?/i,
  "$1</button>",
);

// If still not closed (Add candidate not followed by </button>)
src = src.replace(
  /(<button\b[^>]*>\s*<Plus\b[^>]*\/>\s*Add candidate)(?!\s*<\/button>)/i,
  "$1</button>",
);

if (!/data-kimberley-notes-link=/.test(src)) {
  const re =
    /(<button\b[^>]*>\s*<Plus\b[^>]*\/>\s*Add candidate\s*<\/button>)/i;
  if (!re.test(src)) {
    console.error("Could not normalize Add candidate button");
    console.error("Backup:", bak);
    process.exit(2);
  }
  src = src.replace(re, `$1\n              ${BTN}`);
  console.log("Repaired Add candidate button and inserted Notes link after it");
} else {
  console.log("Notes link already present after cleanup");
}

if (/<<a\b/.test(src) || /Add candidate\s*\n\s*<a\b/i.test(src)) {
  console.error("REFUSING: Add candidate button still looks broken");
  process.exit(2);
}
if ((src.match(/data-kimberley-notes-link=/g) || []).length !== 1) {
  console.error("REFUSING: expected 1 Notes link");
  process.exit(2);
}

fs.writeFileSync(appPath, src, "utf8");
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
