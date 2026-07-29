#!/usr/bin/env node
/**
 * Place Kimberley Notes WITH Add candidate as one uniform control group.
 *
 * ONE LINE (no backslash — a trailing \\ leaves a leading space and breaks ~/):
 *   node gina-express/frontend/patch-notes-toolbar-button.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 *
 * If App.jsx is already broken (</a>/button>), use fix-notes-toolbar-jsx.mjs instead.
 */

import fs from "fs";
import {
  insertNotesWithAddCandidate,
  resolveAppJsxPath,
} from "./notes-toolbar-markup.mjs";

const target = resolveAppJsxPath(process.argv);
if (!target || !fs.existsSync(target)) {
  console.error("Could not find App.jsx at:", JSON.stringify(target || "(empty)"));
  console.error(
    "Usage (one line): node patch-notes-toolbar-button.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx",
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
    if (idx >= 0) console.error(cur.slice(Math.max(0, idx - 120), idx + 220));
  }
  process.exit(2);
}

fs.writeFileSync(target, result.src, "utf8");
console.log("OK: wrote uniform Add candidate | Kimberley Notes");
console.log("Backup:", bak);
console.log("Wrote:", target);
console.log(`
Next (copy each line):
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend
  git add gina-backend/frontend/src/App.jsx
  git status
  git commit -m "Uniform Kimberley Notes with Add candidate"
  git push origin main
`);
