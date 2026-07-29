#!/usr/bin/env node
/**
 * Repair broken Notes toolbar JSX, then place Notes WITH Add candidate.
 *
 * ONE LINE (no backslash):
 *   node gina-express/frontend/fix-notes-toolbar-jsx.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 */

import fs from "fs";
import {
  insertNotesWithAddCandidate,
  resolveAppJsxPath,
} from "./notes-toolbar-markup.mjs";

const appPath = resolveAppJsxPath(process.argv);
if (!appPath || !fs.existsSync(appPath)) {
  console.error("Could not find App.jsx at:", JSON.stringify(appPath || "(empty)"));
  console.error(
    "Usage (one line): node fix-notes-toolbar-jsx.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx",
  );
  process.exit(1);
}

let src = fs.readFileSync(appPath, "utf8");
const bak = `${appPath}.bak-fix-notes-toolbar-${Date.now()}`;
fs.copyFileSync(appPath, bak);

const result = insertNotesWithAddCandidate(src);
if (!result.ok) {
  console.error("REFUSING:", result.reason);
  const idx = src.search(/Add candidate/i);
  console.error(src.slice(Math.max(0, (idx || 0) - 80), (idx || 0) + 220));
  process.exit(2);
}

fs.writeFileSync(appPath, result.src, "utf8");
console.log("OK: repaired App.jsx — uniform Add candidate | Kimberley Notes");
console.log("Backup:", bak);
console.log("Wrote:", appPath);
console.log(`
Next (copy each line):
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend
  git add gina-backend/frontend/src/App.jsx
  git status
  git commit -m "Fix uniform Kimberley Notes with Add candidate"
  git push origin main
`);
