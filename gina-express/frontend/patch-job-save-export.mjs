#!/usr/bin/env node
/**
 * Install Job Save/Export as ONE file next to server.js:
 *   job-save-ats.js
 *
 * Avoids Railway ERR_MODULE_NOT_FOUND when routes/ wasn't committed.
 *
 * If Railway is down, rollback FIRST:
 *   node gina-express/frontend/rollback-job-save-export.mjs ~/lyday-gina-backend/gina-backend
 *
 * Then:
 *   node gina-express/frontend/patch-job-save-export.mjs ~/lyday-gina-backend/gina-backend
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
    "Usage: node patch-job-save-export.mjs ~/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

const serverHead = fs.readFileSync(serverPath, "utf8").slice(0, 1500);
const isCjs =
  /\brequire\s*\(/.test(serverHead) && !/^import\s+/m.test(serverHead);
if (isCjs) {
  console.error("server.js looks CommonJS. This patch is ESM-only.");
  process.exit(2);
}

const kitFile = path.join(__dirname, "..", "job-save-ats.js");
const destFile = path.join(ginaDir, "job-save-ats.js");
fs.copyFileSync(kitFile, destFile);
console.log("Copied job-save-ats.js →", destFile);

// Disable obsolete modules that caused prior crashes (keep files, stop importing)
for (const rel of ["job-save-page.route.js", "routes/job-save-export.js"]) {
  const p = path.join(ginaDir, rel);
  if (fs.existsSync(p) && !p.endsWith(".disabled")) {
    // leave routes file if present — just don't import it from server
    if (rel === "job-save-page.route.js") {
      fs.renameSync(p, `${p}.disabled-${Date.now()}`);
      console.log("Disabled", rel);
    }
  }
}

let server = fs.readFileSync(serverPath, "utf8");
const bak = `${serverPath}.bak-job-save-${Date.now()}`;
fs.copyFileSync(serverPath, bak);
console.log("Backup", path.basename(bak));

// Strip ALL prior job-save wiring
server = server.replace(
  /\n?import\s*[^;]*from\s*["']\.\/job-save-page\.route\.js["'];\s*\n?/g,
  "\n",
);
server = server.replace(
  /\n?import\s*[^;]*from\s*["']\.\/routes\/job-save-export\.js["'];\s*\n?/g,
  "\n",
);
server = server.replace(
  /\n?import\s*[^;]*from\s*["']\.\/job-save-ats\.js["'];\s*\n?/g,
  "\n",
);
server = server.replace(/\n?\s*mountJobSavePage\s*\(\s*app\s*\)\s*;\s*\n?/g, "\n");
server = server.replace(/\n?\s*mountJobSaveAts\s*\(\s*app\s*\)\s*;\s*\n?/g, "\n");
server = server.replace(
  /\n?\s*app\.use\(\s*["']\/ats["']\s*,\s*jobSaveExportRouter\s*\)\s*;\s*\n?/g,
  "\n",
);
server = server.replace(
  /\n?\s*app\.use\(\s*["']\/ats["']\s*,\s*jobSaveAts\s*\)\s*;\s*\n?/g,
  "\n",
);

const importLine =
  'import jobSaveAts, { mountJobSaveAts } from "./job-save-ats.js";\n';
server = importLine + server;

if (/app\.use\(\s*["']\/ats["']/.test(server)) {
  server = server.replace(
    /(app\.use\(\s*["']\/ats["'][^;]*;)/,
    `$1\napp.use("/ats", jobSaveAts);`,
  );
} else {
  server += `\napp.use("/ats", jobSaveAts);\n`;
}

if (/app\.listen\s*\(/.test(server)) {
  server = server.replace(/app\.listen\s*\(/, "mountJobSaveAts(app);\napp.listen(");
} else {
  server += `\nmountJobSaveAts(app);\n`;
}

fs.writeFileSync(serverPath, server, "utf8");

if (!fs.existsSync(destFile)) {
  console.error("FAILED: job-save-ats.js missing after copy");
  process.exit(2);
}

console.log(`
CRITICAL — commit BOTH files (this is what broke Railway before):

  cd ~/lyday-gina-backend

  # If gina code lives in gina-backend/:
  ls gina-backend/server.js gina-backend/job-save-ats.js
  git add gina-backend/server.js gina-backend/job-save-ats.js

  # If gina code is repo root:
  # ls server.js job-save-ats.js
  # git add server.js job-save-ats.js

  git status
  # You MUST see job-save-ats.js staged

  git commit -m "Add job-save-ats.js single-file Save/Export mount"
  git pull origin main --rebase
  git push origin main
`);
