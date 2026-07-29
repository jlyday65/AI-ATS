#!/usr/bin/env node
/**
 * Recover a healthy App.jsx, then insert Kimberley Notes as a SAFE sibling
 * of Add candidate (same look, no <span> wrap, never inside the button).
 *
 * ONE LINE:
 *   node gina-express/frontend/fix-notes-toolbar-jsx.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 */

import fs from "fs";
import path from "path";
import {
  insertNotesWithAddCandidate,
  isToolbarCorrupt,
  pickBestAppJsxBackup,
  resolveAppJsxPath,
  scoreAppJsx,
} from "./notes-toolbar-markup.mjs";

const appPath = resolveAppJsxPath(process.argv);
if (!appPath || !fs.existsSync(appPath)) {
  console.error(
    "Could not find App.jsx at:",
    JSON.stringify(appPath || "(empty)"),
  );
  console.error(
    "Usage (one line): node fix-notes-toolbar-jsx.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx",
  );
  process.exit(1);
}

const live = fs.readFileSync(appPath, "utf8");
const liveCorrupt = isToolbarCorrupt(live);
const liveScore = scoreAppJsx(live, appPath);

console.log("Live App.jsx:", {
  corrupt: liveCorrupt,
  score: liveScore.score,
  reasons: liveScore.reasons,
});

const bak = `${appPath}.bak-fix-notes-toolbar-${Date.now()}`;
fs.copyFileSync(appPath, bak);
console.log("Backup of current (broken) file:", bak);

let base = live;
let restoredFrom = null;

// If corrupt or low score, restore best backup first
if (liveCorrupt || liveScore.score < 40) {
  const candidates = pickBestAppJsxBackup(appPath).filter(
    (c) => c.path !== appPath && c.hasApp && c.score >= 40 && !isToolbarCorrupt(c.text),
  );
  console.log("\nTop healthy backups:");
  for (const c of candidates.slice(0, 8)) {
    console.log(
      `  score=${c.score} ${path.basename(c.label)} (${c.reasons.join(", ")})`,
    );
  }
  const best = candidates[0];
  if (!best) {
    console.error(`
No healthy App.jsx backup found.

Try:
  node gina-express/frontend/recover-app-jsx.mjs ~/lyday-gina-backend/gina-backend

Or manually:
  cd ~/lyday-gina-backend
  ls -lt gina-backend/frontend/src/App.jsx.bak-* | head
  cp gina-backend/frontend/src/App.jsx.bak-iframe-notes-* gina-backend/frontend/src/App.jsx
`);
    process.exit(2);
  }
  base = best.text;
  restoredFrom = best.label;
  console.log("\nRestored from:", restoredFrom);
}

const result = insertNotesWithAddCandidate(base);
if (!result.ok) {
  console.error("REFUSING after restore/insert:", result.reason);
  const idx = base.search(/Add candidate/i);
  console.error(base.slice(Math.max(0, (idx || 0) - 100), (idx || 0) + 240));
  process.exit(2);
}

fs.writeFileSync(appPath, result.src, "utf8");
console.log("\nOK: App.jsx restored + Notes sibling of Add candidate");
console.log("Wrote:", appPath);
if (restoredFrom) console.log("Base:", restoredFrom);

// Quick sanity: button balance
const opens = (result.src.match(/<button\b/gi) || []).length;
const closes = (result.src.match(/<\/button>/gi) || []).length;
console.log(`Button tags: open=${opens} close=${closes}`);
if (opens !== closes) {
  console.error("REFUSING: button tags still unbalanced — restoring backup");
  fs.copyFileSync(bak, appPath);
  process.exit(2);
}

console.log(`
Next (copy each line):
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend
  git add gina-backend/frontend/src/App.jsx
  git status
  git commit -m "Restore App.jsx and add Kimberley Notes beside Add candidate"
  git push origin main
`);
