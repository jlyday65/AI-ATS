#!/usr/bin/env node
/**
 * Emergency: remove ALL job-save imports from server.js so Railway boots.
 *
 * ONE LINE:
 *   node gina-express/frontend/rollback-job-save-export.mjs ~/lyday-gina-backend/gina-backend
 *
 * Then commit + push server.js immediately.
 */

import fs from "fs";
import path from "path";

const rootArg = String(process.argv[2] || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");
const root = path.resolve(rootArg);
const ginaDir = fs.existsSync(path.join(root, "server.js"))
  ? root
  : fs.existsSync(path.join(root, "gina-backend", "server.js"))
    ? path.join(root, "gina-backend")
    : root;

const serverPath = path.join(ginaDir, "server.js");
if (!fs.existsSync(serverPath)) {
  console.error(
    "Usage: node rollback-job-save-export.mjs ~/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

function scrub(src) {
  let out = src;
  // Any job-save related imports
  out = out.replace(
    /\n?import\s*[^;]*from\s*["']\.\/job-save-page\.route\.js["'];\s*\n?/g,
    "\n",
  );
  out = out.replace(
    /\n?import\s*[^;]*from\s*["']\.\/routes\/job-save-export\.js["'];\s*\n?/g,
    "\n",
  );
  out = out.replace(
    /\n?import\s*[^;]*from\s*["']\.\/job-save-ats\.js["'];\s*\n?/g,
    "\n",
  );
  // Mounts / uses
  out = out.replace(/\n?\s*mountJobSavePage\s*\(\s*app\s*\)\s*;\s*\n?/g, "\n");
  out = out.replace(/\n?\s*mountJobSaveAts\s*\(\s*app\s*\)\s*;\s*\n?/g, "\n");
  out = out.replace(
    /\n?\s*app\.use\(\s*["']\/ats["']\s*,\s*jobSaveExportRouter\s*\)\s*;\s*\n?/g,
    "\n",
  );
  out = out.replace(
    /\n?\s*app\.use\(\s*["']\/ats["']\s*,\s*jobSaveAts\s*\)\s*;\s*\n?/g,
    "\n",
  );
  out = out.replace(
    /\n?\s*app\.use\(\s*["']\/ats["']\s*,\s*createJobSaveExportRouter\s*\(\s*\)\s*\)\s*;\s*\n?/g,
    "\n",
  );
  return out;
}

const emergency = `${serverPath}.bak-rollback-job-save-${Date.now()}`;
fs.copyFileSync(serverPath, emergency);
console.log("Safety copy", path.basename(emergency));

const before = fs.readFileSync(serverPath, "utf8");
const after = scrub(before);
fs.writeFileSync(serverPath, after, "utf8");

const stillBad =
  /job-save-page\.route|routes\/job-save-export|job-save-ats|mountJobSave|jobSaveExportRouter|jobSaveAts/.test(
    after,
  );
if (stillBad) {
  console.error("WARNING: scrub may be incomplete — open server.js and remove job-save lines manually.");
} else {
  console.log("Removed all job-save imports/mounts from server.js");
}

console.log(`
PUSH THIS NOW (restore Railway):

  cd ~/lyday-gina-backend
  git add gina-backend/server.js
  # if server.js is at repo root instead:
  # git add server.js
  git commit -m "Rollback all job-save imports (restore Railway boot)"
  git pull origin main --rebase
  git push origin main

Wait until Gina is healthy. Then install the SINGLE-FILE kit:

  cd ~/AI-ATS && git pull origin cursor/ai-ats-b2b-platform-4f1f
  node gina-express/frontend/patch-job-save-export.mjs ~/lyday-gina-backend/gina-backend
`);
