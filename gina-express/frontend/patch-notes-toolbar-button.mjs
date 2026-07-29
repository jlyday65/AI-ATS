#!/usr/bin/env node
/**
 * Place Kimberley Notes WITH Add candidate as one uniform control group.
 * Same className as Add candidate; Notes is a sibling (never inside the <button>).
 *
 * Usage:
 *   node gina-express/frontend/patch-notes-toolbar-button.mjs \
 *     /Users/jameslyday/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { insertNotesWithAddCandidate } from "./notes-toolbar-markup.mjs";

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

const cur = fs.readFileSync(target, "utf8");
const bak = `${target}.bak-notes-toolbar-${Date.now()}`;
fs.copyFileSync(target, bak);

const result = insertNotesWithAddCandidate(cur);
if (!result.ok) {
  console.error("REFUSING:", result.reason);
  if (result.reason === "add-candidate-missing") {
    const idx = cur.search(/Add candidate/i);
    if (idx >= 0) console.error(cur.slice(Math.max(0, idx - 120), idx + 200));
  }
  process.exit(2);
}

fs.writeFileSync(target, result.src, "utf8");
console.log("Backup:", bak);
console.log("Wrote:", target);
console.log("Inserted Kimberley Notes as uniform sibling of Add candidate");
console.log(`
Next:
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend
  git add gina-backend/frontend/src/App.jsx
  git commit -m "Uniform Kimberley Notes control with Add candidate"
  git push origin main
`);
