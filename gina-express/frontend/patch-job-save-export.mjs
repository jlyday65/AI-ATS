#!/usr/bin/env node
/**
 * Mount Board + Candidate File Save/Export on Gina.
 * Page + API live in routes/job-save-export.js (no separate
 * job-save-page.route.js — that file caused Railway ERR_MODULE_NOT_FOUND).
 *
 * ONE LINE:
 *   node gina-express/frontend/patch-job-save-export.mjs ~/lyday-gina-backend/gina-backend
 *
 * If Railway is down from the old import, run rollback FIRST:
 *   node gina-express/frontend/rollback-job-save-export.mjs ~/lyday-gina-backend/gina-backend
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

function copyInto(relSrc, relDest) {
  const src = path.join(__dirname, "..", relSrc);
  const dest = path.join(ginaDir, relDest);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log("Copied", relDest);
}

copyInto("lib/job-save-export.js", "lib/job-save-export.js");
copyInto("routes/job-save-export.js", "routes/job-save-export.js");
if (!fs.existsSync(path.join(ginaDir, "lib/candidate-files.js"))) {
  copyInto("lib/candidate-files.js", "lib/candidate-files.js");
}
if (!fs.existsSync(path.join(ginaDir, "routes/candidate-files.js"))) {
  copyInto("routes/candidate-files.js", "routes/candidate-files.js");
}
copyInto("frontend/job-save.html", "frontend/public/job-save.html");
copyInto("frontend/job-save.html", "frontend/job-save.html");

// Remove the broken standalone page module if present (was never on Railway).
const badPage = path.join(ginaDir, "job-save-page.route.js");
if (fs.existsSync(badPage)) {
  fs.renameSync(badPage, `${badPage}.disabled-${Date.now()}`);
  console.log("Disabled obsolete job-save-page.route.js");
}

let server = fs.readFileSync(serverPath, "utf8");
const bak = `${serverPath}.bak-job-save-${Date.now()}`;
fs.copyFileSync(serverPath, bak);
console.log("Backup", path.basename(bak));

// Strip any old broken imports / mounts first.
server = server.replace(
  /\n?import\s*\{\s*mountJobSavePage\s*\}\s*from\s*["']\.\/job-save-page\.route\.js["'];\s*\n?/g,
  "\n",
);
server = server.replace(
  /\n?import\s+mountJobSavePage\s+from\s*["']\.\/job-save-page\.route\.js["'];\s*\n?/g,
  "\n",
);
server = server.replace(/\n?\s*mountJobSavePage\s*\(\s*app\s*\)\s*;\s*\n?/g, "\n");
server = server.replace(
  /\n?import\s+jobSaveExportRouter\s+from\s*["']\.\/routes\/job-save-export\.js["'];\s*\n?/g,
  "\n",
);
server = server.replace(
  /\n?\s*app\.use\(\s*["']\/ats["']\s*,\s*jobSaveExportRouter\s*\)\s*;\s*\n?/g,
  "\n",
);

const importLine =
  'import jobSaveExportRouter, { mountJobSavePage } from "./routes/job-save-export.js";\n';
if (!/from\s+["']\.\/routes\/job-save-export\.js["']/.test(server)) {
  server = importLine + server;
} else if (!/mountJobSavePage/.test(server.split("\n").find((l) => /job-save-export/.test(l)) || "")) {
  // Replace prior import with combined import
  server = server.replace(
    /import\s+[^;]*from\s*["']\.\/routes\/job-save-export\.js["'];\s*/,
    importLine,
  );
}

if (!/app\.use\(\s*["']\/ats["']\s*,\s*jobSaveExportRouter/.test(server)) {
  if (/app\.use\(\s*["']\/ats["']/.test(server)) {
    server = server.replace(
      /(app\.use\(\s*["']\/ats["'][^;]*;)/,
      `$1\napp.use("/ats", jobSaveExportRouter);`,
    );
  } else {
    server += `\napp.use("/ats", jobSaveExportRouter);\n`;
  }
}

if (!/mountJobSavePage\s*\(\s*app\s*\)/.test(server)) {
  if (/app\.listen\s*\(/.test(server)) {
    server = server.replace(
      /app\.listen\s*\(/,
      "mountJobSavePage(app);\napp.listen(",
    );
  } else {
    server += `\nmountJobSavePage(app);\n`;
  }
}

fs.writeFileSync(serverPath, server, "utf8");
console.log("Mounted job-save via routes/job-save-export.js only");

// Verify required files exist before user pushes
const required = [
  "routes/job-save-export.js",
  "lib/job-save-export.js",
  "frontend/public/job-save.html",
];
for (const rel of required) {
  const p = path.join(ginaDir, rel);
  if (!fs.existsSync(p)) {
    console.error("MISSING required file:", rel);
    process.exit(2);
  }
}

console.log(`
Commit ALL of these (not just server.js):

  cd ~/lyday-gina-backend
  git add gina-backend/server.js \\
          gina-backend/routes/job-save-export.js \\
          gina-backend/lib/job-save-export.js \\
          gina-backend/frontend/job-save.html \\
          gina-backend/frontend/public/job-save.html
  git status
  git commit -m "Fix job-save export mount (no separate page route file)"
  git pull origin main --rebase
  git push origin main

Optional toolbar:
  node gina-express/frontend/patch-job-save-toolbar.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
`);
