#!/usr/bin/env node
/**
 * Insert Kimberley Notes as a SAFE sibling of Add candidate.
 * Does not wrap in a span. Refuses if App.jsx looks corrupt — use fix-notes-toolbar-jsx.mjs.
 *
 * ONE LINE:
 *   node gina-express/frontend/patch-notes-toolbar-button.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 */

import fs from "fs";
import {
  insertNotesWithAddCandidate,
  isToolbarCorrupt,
  resolveAppJsxPath,
} from "./notes-toolbar-markup.mjs";

const target = resolveAppJsxPath(process.argv);
if (!target || !fs.existsSync(target)) {
  console.error(
    "Could not find App.jsx at:",
    JSON.stringify(target || "(empty)"),
  );
  console.error(
    "Usage (one line): node patch-notes-toolbar-button.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx",
  );
  process.exit(1);
}

const cur = fs.readFileSync(target, "utf8");
const corrupt = isToolbarCorrupt(cur);
if (corrupt) {
  console.error("App.jsx looks corrupt (" + corrupt + ").");
  console.error(
    "Run instead: node gina-express/frontend/fix-notes-toolbar-jsx.mjs " +
      target,
  );
  process.exit(2);
}

const bak = `${target}.bak-notes-toolbar-${Date.now()}`;
fs.copyFileSync(target, bak);

const result = insertNotesWithAddCandidate(cur);
if (!result.ok) {
  console.error("REFUSING:", result.reason);
  process.exit(2);
}

fs.writeFileSync(target, result.src, "utf8");
console.log("OK: Notes sibling of Add candidate");
console.log("Backup:", bak);
console.log("Wrote:", target);
console.log(`
Next:
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend
  git add gina-backend/frontend/src/App.jsx
  git status
  git commit -m "Add Kimberley Notes beside Add candidate"
  git push origin main
`);
