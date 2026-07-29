#!/usr/bin/env node
/**
 * Emergency: undo Candidate File mounts that 502'd Railway.
 * Restores server.js / gina.js from the newest bak-candidate-files backup,
 * or scrubs Candidate File import/mount lines if no bak exists.
 *
 * ONE LINE:
 *   node gina-express/frontend/rollback-candidate-files.mjs ~/lyday-gina-backend/gina-backend
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

if (!fs.existsSync(path.join(ginaDir, "server.js"))) {
  console.error(
    "Usage (one line): node rollback-candidate-files.mjs ~/lyday-gina-backend/gina-backend",
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
    /\n?import\s*\{\s*createCandidateFilesRouter\s*\}\s*from\s*["']\.\/routes\/candidate-files\.js["'];\s*\n?/g,
    "\n",
  );
  out = out.replace(
    /\n?import\s+createCandidateFilesRouter\s+from\s*["']\.\/routes\/candidate-files\.js["'];\s*\n?/g,
    "\n",
  );
  out = out.replace(
    /\n?import\s*\{\s*mountCandidateFilePage\s*\}\s*from\s*["']\.\/candidate-file-page\.route\.js["'];\s*\n?/g,
    "\n",
  );
  out = out.replace(
    /\n?import\s+mountCandidateFilePage\s+from\s*["']\.\/candidate-file-page\.route\.js["'];\s*\n?/g,
    "\n",
  );
  out = out.replace(
    /\n?import\s+express\s+from\s*["']express["'];\s*\n?/g,
    (m, offset, full) => {
      // Only remove if it was added solely for candidate-file page — too risky; leave express imports
      return m;
    },
  );
  out = out.replace(/\n?\s*mountCandidateFilePage\s*\(\s*app\s*\)\s*;\s*\n?/g, "\n");
  out = out.replace(
    /\n?\s*app\.use\(\s*["']\/ats["']\s*,\s*createCandidateFilesRouter\s*\(\s*\)\s*\)\s*;\s*\n?/g,
    "\n",
  );
  out = out.replace(
    /\n?\s*console\.log\(\s*["']\[candidate-files\][^"']*["']\s*\)\s*;\s*\n?/g,
    "\n",
  );
  out = out.replace(
    /\n?\s*console\.log\(\s*["']\[candidate-file\][^"']*["']\s*\)\s*;\s*\n?/g,
    "\n",
  );
  return out;
}

function restoreOrScrub(fileName) {
  const filePath = path.join(ginaDir, fileName);
  if (!fs.existsSync(filePath)) return;
  const bak = newestBak(ginaDir, `${fileName}.bak-candidate-files-`);
  const safety = `${filePath}.bak-before-rollback-${Date.now()}`;
  fs.copyFileSync(filePath, safety);

  if (bak) {
    fs.copyFileSync(bak, filePath);
    console.log("Restored", fileName, "from", path.basename(bak));
  } else {
    const before = fs.readFileSync(filePath, "utf8");
    const after = scrub(before);
    if (after !== before) {
      fs.writeFileSync(filePath, after, "utf8");
      console.log("Scrubbed Candidate File mounts from", fileName);
    } else {
      console.log("No Candidate File mounts found in", fileName);
    }
  }
  console.log("Safety copy of pre-rollback file:", path.basename(safety));
}

restoreOrScrub("server.js");
restoreOrScrub("gina.js");

console.log(`
Next:
  cd ~/lyday-gina-backend
  git add gina-backend/server.js gina-backend/gina.js
  git commit -m "Rollback Candidate File mount (restore ATS from 502)"
  git push origin main

Railway Redeploy — confirm board loads, then optionally re-run the FIXED patch:
  cd ~/AI-ATS && git pull origin cursor/ai-ats-b2b-platform-4f1f
  node gina-express/frontend/patch-candidate-files.mjs ~/lyday-gina-backend/gina-backend
`);
