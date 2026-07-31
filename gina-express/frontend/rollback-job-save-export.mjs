#!/usr/bin/env node
/**
 * Emergency: undo Job Save/Export mounts that crash Railway
 * (missing job-save-page.route.js).
 *
 * ONE LINE:
 *   node gina-express/frontend/rollback-job-save-export.mjs ~/lyday-gina-backend/gina-backend
 *
 * Then commit + push Gina main so Railway boots again.
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

function newestBak(dir, prefix) {
  const files = fs
    .readdirSync(dir)
    .filter((n) => n.startsWith(prefix))
    .map((n) => path.join(dir, n))
    .filter((p) => fs.statSync(p).isFile())
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] || null;
}

function scrub(src) {
  let out = src;
  out = out.replace(
    /\n?import\s*\{\s*mountJobSavePage\s*\}\s*from\s*["']\.\/job-save-page\.route\.js["'];\s*\n?/g,
    "\n",
  );
  out = out.replace(
    /\n?import\s+mountJobSavePage\s+from\s*["']\.\/job-save-page\.route\.js["'];\s*\n?/g,
    "\n",
  );
  out = out.replace(
    /\n?import\s*\{\s*mountJobSavePage\s*,\s*[^}]*\}\s*from\s*["']\.\/routes\/job-save-export\.js["'];\s*\n?/g,
    "\n",
  );
  out = out.replace(
    /\n?import\s+jobSaveExportRouter\s+from\s*["']\.\/routes\/job-save-export\.js["'];\s*\n?/g,
    "\n",
  );
  out = out.replace(
    /\n?import\s*\{\s*createJobSaveExportRouter\s*\}\s*from\s*["']\.\/routes\/job-save-export\.js["'];\s*\n?/g,
    "\n",
  );
  out = out.replace(/\n?\s*mountJobSavePage\s*\(\s*app\s*\)\s*;\s*\n?/g, "\n");
  out = out.replace(
    /\n?\s*app\.use\(\s*["']\/ats["']\s*,\s*jobSaveExportRouter\s*\)\s*;\s*\n?/g,
    "\n",
  );
  out = out.replace(
    /\n?\s*app\.use\(\s*["']\/ats["']\s*,\s*createJobSaveExportRouter\s*\(\s*\)\s*\)\s*;\s*\n?/g,
    "\n",
  );
  return out;
}

const bak = newestBak(ginaDir, "server.js.bak-job-save-");
const emergency = `${serverPath}.bak-rollback-job-save-${Date.now()}`;
fs.copyFileSync(serverPath, emergency);
console.log("Safety copy", path.basename(emergency));

if (bak) {
  fs.copyFileSync(bak, serverPath);
  console.log("Restored server.js from", path.basename(bak));
} else {
  const before = fs.readFileSync(serverPath, "utf8");
  const after = scrub(before);
  fs.writeFileSync(serverPath, after, "utf8");
  console.log("Scrubbed job-save imports/mounts from server.js (no bak found)");
}

// Leave route files in place; they are unused after scrub.
console.log(`
Gina should boot again after:

  cd ~/lyday-gina-backend
  git add gina-backend/server.js
  git commit -m "Rollback job-save-page.route import (restore Railway)"
  git pull origin main --rebase
  git push origin main

After Railway is healthy, re-install the FIXED kit (no separate page file):

  cd ~/AI-ATS && git pull origin cursor/ai-ats-b2b-platform-4f1f
  node gina-express/frontend/patch-job-save-export.mjs ~/lyday-gina-backend/gina-backend
`);
