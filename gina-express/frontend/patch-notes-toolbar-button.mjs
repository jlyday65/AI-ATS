#!/usr/bin/env node
/**
 * Place a "Kimberley Notes" control next to the main ATS toolbar
 * (Reminders / CSV / Import / Backup / Questions / Add candidate).
 *
 * Plain <a href="/notes"> — opens Notes (auto-loads). No React panel / iframe.
 *
 * Usage:
 *   node gina-express/frontend/patch-notes-toolbar-button.mjs \
 *     /Users/jameslyday/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 */

import fs from "fs";
import path from "path";

const target = path.resolve(
  String(process.argv[2] || "").replace(/^~/, process.env.HOME || "").trim(),
);
if (!target || !fs.existsSync(target)) {
  console.error(
    "Usage: node patch-notes-toolbar-button.mjs /Users/.../frontend/src/App.jsx",
  );
  process.exit(1);
}

let src = fs.readFileSync(target, "utf8");
const bak = `${target}.bak-notes-toolbar-${Date.now()}`;
fs.copyFileSync(target, bak);

// Remove prior floating / misplaced Notes links we may have added
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

let placed = false;

// Prefer: after an "Add candidate" button/label
const patterns = [
  // JSX text node Add candidate inside button
  /(>\s*Add candidate\s*<)/i,
  /(>\s*Add Candidate\s*<)/i,
  // Nearby toolbar labels
  /(>\s*Questions\s*<)/i,
  /(>\s*Reminders\s*<)/i,
  /(>\s*Import CSV\s*<)/i,
  /(>\s*Backup\s*<)/i,
];

for (const re of patterns) {
  if (re.test(src)) {
    src = src.replace(re, (m) => `${m}${BTN}`);
    placed = true;
    console.log("Inserted Kimberley Notes after", String(re));
    break;
  }
}

// Fallback: after a button that contains addCandidate / setShowAdd
if (!placed) {
  const re =
    /(<button\b[^>]*(?:addCandidate|Add candidate|setShowAdd|onAddCandidate)[^>]*>[\s\S]*?<\/button>)/i;
  if (re.test(src)) {
    src = src.replace(re, (m) => `${m}\n        ${BTN}`);
    placed = true;
    console.log("Inserted Kimberley Notes after Add-candidate-like button");
  }
}

if (!placed) {
  // Last resort: first toolbar-ish flex row containing Reminders
  const idx = src.search(/>\s*Reminders\s*</);
  if (idx >= 0) {
    const close = src.indexOf("</", idx);
    if (close > idx) {
      const insertAt = src.indexOf(">", close) + 1;
      src = src.slice(0, insertAt) + BTN + src.slice(insertAt);
      placed = true;
      console.log("Inserted Kimberley Notes near Reminders cluster");
    }
  }
}

if (!placed) {
  console.error("Could not find Reminders/CSV/Add candidate toolbar");
  console.error("Backup unused. Add manually near those buttons:\n", BTN);
  process.exit(2);
}

if (/KimberleyNotes(Panel|Gate)/.test(src)) {
  console.error("REFUSING: React Notes panel/gate present — keep using /notes link only");
  process.exit(2);
}
if ((src.match(/data-kimberley-notes-link=/g) || []).length !== 1) {
  console.error(
    "REFUSING: expected exactly 1 Notes link, found",
    (src.match(/data-kimberley-notes-link=/g) || []).length,
  );
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
  git commit -m "Move Kimberley Notes button into main ATS toolbar"
  git push origin main
`);
