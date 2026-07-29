#!/usr/bin/env node
/**
 * Repair App.jsx Notes toolbar, then place Notes WITH Add candidate uniformly.
 *
 * Usage:
 *   node gina-express/frontend/fix-notes-toolbar-jsx.mjs \
 *     /Users/jameslyday/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 */

import fs from "fs";
import path from "path";
import { insertNotesWithAddCandidate } from "./notes-toolbar-markup.mjs";

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

// Heal common corruptions before insert
src = src.replace(/<<+a\b/g, "<a");
const idx = src.search(/Add candidate/i);
if (idx >= 0) {
  const needle = "Add candidate";
  let after = src.slice(idx + needle.length);
  // If Notes was jammed before </button>, pull it out
  after = after.replace(/^\s*<+a\b[\s\S]*?<\/a>/i, "");
  if (!/^\s*<\/button>/i.test(after)) {
    after = "</button>" + after;
  }
  src = src.slice(0, idx + needle.length) + after;
}

const result = insertNotesWithAddCandidate(src);
if (!result.ok) {
  console.error("REFUSING:", result.reason);
  console.error(src.slice(Math.max(0, (idx || 0) - 80), (idx || 0) + 200));
  process.exit(2);
}

fs.writeFileSync(appPath, result.src, "utf8");
console.log("Repaired and inserted uniform Add candidate + Kimberley Notes group");
console.log("Backup:", bak);
console.log("Wrote:", appPath);
console.log(`
Next:
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend
  git add gina-backend/frontend/src/App.jsx
  git commit -m "Uniform Kimberley Notes with Add candidate"
  git push origin main
`);
