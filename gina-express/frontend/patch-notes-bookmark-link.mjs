#!/usr/bin/env node
/**
 * Add a "Kimberley Notes" bookmark link on the ATS page.
 * Plain <a href="/notes" target="_blank"> — no React panel, no iframe, no view state.
 *
 * Usage:
 *   node gina-express/frontend/patch-notes-bookmark-link.mjs \
 *     /Users/jameslyday/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 */

import fs from "fs";
import path from "path";

const target = path.resolve(
  String(process.argv[2] || "").replace(/^~/, process.env.HOME || "").trim(),
);
if (!target || !fs.existsSync(target)) {
  console.error(
    "Usage: node patch-notes-bookmark-link.mjs /Users/.../frontend/src/App.jsx",
  );
  process.exit(1);
}

let src = fs.readFileSync(target, "utf8");
if (/data-kimberley-notes-link=/.test(src)) {
  console.log("Notes link already present — nothing to do");
  process.exit(0);
}

const bak = `${target}.bak-notes-link-${Date.now()}`;
fs.copyFileSync(target, bak);

const LINK = `<a
          data-kimberley-notes-link="1"
          href="/notes"
          target="_blank"
          rel="noreferrer"
          style={{
            position: "fixed",
            right: 16,
            bottom: 16,
            zIndex: 9999,
            fontSize: 13,
            padding: "8px 12px",
            background: "#2C2A24",
            color: "#fff",
            textDecoration: "none",
            borderRadius: 8,
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          }}
        >
          Kimberley Notes
        </a>`;

// Insert as first child inside the first returned root <div> of App (common pattern)
let ok = false;
if (/return\s*\(\s*\n\s*<div[\s>]/.test(src) || /return\s*\(\s*<div[\s>]/.test(src)) {
  src = src.replace(
    /return\s*\(\s*\n?(\s*)<div([^>]*)>/,
    (full, indent, attrs) =>
      `return (\n${indent || "        "}<div${attrs}>\n${indent || "        "}  ${LINK}`,
  );
  ok = /data-kimberley-notes-link=/.test(src);
}

if (!ok) {
  console.error("Could not find a safe insert point (return ( <div ...>).");
  console.error("Backup unused conceptually; file not written.");
  console.error("Add this manually near the top of your App JSX:\n", LINK);
  process.exit(2);
}

if (/KimberleyNotes(Panel|Gate)/.test(src)) {
  console.error("REFUSING: React Notes panel/gate still in App.jsx");
  process.exit(2);
}
if ((src.match(/data-kimberley-notes-link=/g) || []).length !== 1) {
  console.error("REFUSING: expected exactly one Notes link marker");
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
  git status
  git commit -m "Add Kimberley Notes bookmark link on ATS page"
  git push origin main

Railway Redeploy → hard refresh board.
You should see a "Kimberley Notes" button (bottom-right) that opens /notes in a new tab.

If white screen:
  cp "${bak}" "${target}"
  then rebuild / commit / push again.
`);
