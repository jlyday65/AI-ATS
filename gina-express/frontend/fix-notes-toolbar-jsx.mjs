#!/usr/bin/env node
/**
 * Repair App.jsx after a bad Notes toolbar insert left "<<a" / broken Add candidate button.
 * Then places Kimberley Notes AFTER the Add candidate </button>.
 *
 * Usage:
 *   node gina-express/frontend/fix-notes-toolbar-jsx.mjs \
 *     /Users/jameslyday/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 */

import fs from "fs";
import path from "path";

const target = path.resolve(
  String(process.argv[2] || "").replace(/^~/, process.env.HOME || "").trim(),
);
if (!target || !fs.existsSync(target)) {
  console.error(
    "Usage: node fix-notes-toolbar-jsx.mjs /Users/.../frontend/src/App.jsx",
  );
  process.exit(1);
}

let src = fs.readFileSync(target, "utf8");
const bak = `${target}.bak-fix-notes-toolbar-${Date.now()}`;
fs.copyFileSync(target, bak);

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

// 1) Remove any existing Notes links (broken or not)
src = src.replace(
  /\s*<a\b[^>]*data-kimberley-notes-link=["']1["'][^>]*>[\s\S]*?<\/a>/g,
  "",
);

// 2) Fix the specific corruption: Add candidate <<a ... or Add candidate</a> leftovers
src = src.replace(
  /(Add candidate)\s*<<a\b[\s\S]*?<\/a>\s*\/?button>/gi,
  "$1</button>",
);
src = src.replace(/Add candidate\s*<<a\b[\s\S]*?<\/a>/gi, "Add candidate");
src = src.replace(/<<a\b/g, "<a");

// If button never closed: `Add candidate` then junk then `/button>` 
src = src.replace(
  /(<button\b[^>]*>[\s\S]*?Add candidate)\s*\/button>/i,
  "$1</button>",
);

// Common broken pattern from the bad patch:
//   <Plus ... /> Add candidate
//   <<a ...>Kimberley Notes</a>utton>
// or </a> still leaving broken close
src = src.replace(
  /(<Plus\b[^>]*\/>\s*Add candidate)\s*<a\b[^>]*data-kimberley-notes-link[\s\S]*?<\/a>\s*(<\/?button>)/i,
  "$1\n              $2",
);
src = src.replace(
  /(<Plus\b[^>]*\/>\s*Add candidate)\s*<\/a>\s*/i,
  "$1\n              ",
);

// Ensure Add candidate button is properly closed
if (
  /Add candidate/i.test(src) &&
  !/Add candidate[\s\S]{0,80}<\/button>/i.test(src)
) {
  src = src.replace(
    /(<button\b[^>]*>\s*<Plus\b[^>]*\/>\s*Add candidate)\s*/i,
    "$1</button>\n              ",
  );
  console.log("Forced close on Add candidate button");
}

// 3) Insert Notes link immediately AFTER the Add candidate </button>
if (!/data-kimberley-notes-link=/.test(src)) {
  const re =
    /(<button\b[^>]*>\s*<Plus\b[^>]*\/>\s*Add candidate\s*<\/button>)/i;
  if (re.test(src)) {
    src = src.replace(re, `$1\n              ${BTN}`);
    console.log("Inserted Kimberley Notes after Add candidate </button>");
  } else {
    // Broader: any </button> that follows Add candidate within 120 chars
    const idx = src.search(/Add candidate/i);
    if (idx >= 0) {
      const slice = src.slice(idx, idx + 200);
      const closeRel = slice.search(/<\/button>/i);
      if (closeRel >= 0) {
        const at = idx + closeRel + "</button>".length;
        src = src.slice(0, at) + `\n              ${BTN}` + src.slice(at);
        console.log("Inserted Kimberley Notes after nearby </button>");
      } else {
        console.error("Could not find Add candidate </button> to insert after");
        console.error("Backup:", bak);
        process.exit(2);
      }
    } else {
      console.error("Could not find Add candidate in App.jsx");
      console.error("Backup:", bak);
      process.exit(2);
    }
  }
}

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
if (/KimberleyNotes(Panel|Gate)/.test(src)) {
  console.error("REFUSING: React Notes panel/gate present");
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
  git commit -m "Fix Notes toolbar link; place after Add candidate"
  git push origin main
`);
