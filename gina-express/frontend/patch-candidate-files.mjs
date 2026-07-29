#!/usr/bin/env node
/**
 * Mount Candidate Files API + standalone page on Gina backend.
 *
 * ONE LINE:
 *   node gina-express/frontend/patch-candidate-files.mjs ~/lyday-gina-backend/gina-backend
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raw = String(process.argv[2] || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");
const ginaDir = path.resolve(raw);
if (!ginaDir || !fs.existsSync(ginaDir)) {
  console.error(
    "Usage (one line): node patch-candidate-files.mjs ~/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

function copyInto(relSrc, relDest) {
  const src = path.join(__dirname, "..", relSrc);
  const dest = path.join(ginaDir, relDest);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log("Copied", relDest);
}

copyInto("lib/candidate-files.js", "lib/candidate-files.js");
copyInto("routes/candidate-files.js", "routes/candidate-files.js");
copyInto("frontend/candidate-file.html", "frontend/public/candidate-file.html");
copyInto("frontend/candidate-file.html", "frontend/candidate-file.html");

const html = fs.readFileSync(
  path.join(ginaDir, "frontend/public/candidate-file.html"),
  "utf8",
);

const routeJs = `/** AUTO: candidate-file page (embedded) */
import express from "express";
const __cfHtml = ${JSON.stringify(html)};
export function sendCandidateFilePage(_req, res) {
  res.type("html").send(__cfHtml);
}
export default function mountCandidateFilePage(app) {
  const send = sendCandidateFilePage;
  app.get("/candidate-file", send);
  app.get("/candidate-files", send);
  app.get("/candidate-file.html", send);
  console.log("[candidate-file] page routes: /candidate-file /candidate-files");
}
`;

const routePath = path.join(ginaDir, "candidate-file-page.route.js");
fs.writeFileSync(routePath, routeJs, "utf8");
console.log("Wrote candidate-file-page.route.js");

function ensureMount(serverPath) {
  if (!fs.existsSync(serverPath)) return false;
  let src = fs.readFileSync(serverPath, "utf8");
  const bak = `${serverPath}.bak-candidate-files-${Date.now()}`;
  fs.copyFileSync(serverPath, bak);

  if (!/candidate-files\.js/.test(src)) {
    const importLine =
      'import { createCandidateFilesRouter } from "./routes/candidate-files.js";\n';
    if (/^import /m.test(src)) {
      src = src.replace(/^(import .+\n)/m, `$1${importLine}`);
    } else {
      src = importLine + src;
    }
    const mount =
      '\napp.use("/ats", createCandidateFilesRouter());\nconsole.log("[candidate-files] /ats/candidate-files mounted");\n';
    if (/app\.listen\(/.test(src)) {
      src = src.replace(/app\.listen\(/, `${mount}app.listen(`);
    } else {
      src += mount;
    }
    console.log("Mounted candidate-files router in", path.basename(serverPath));
  } else {
    console.log("candidate-files router already referenced in", path.basename(serverPath));
  }

  if (!/candidate-file-page\.route|\/candidate-file/.test(src) || !/mountCandidateFilePage/.test(src)) {
    if (!/candidate-file-page\.route/.test(src)) {
      const imp =
        'import mountCandidateFilePage from "./candidate-file-page.route.js";\n';
      src = src.replace(/^(import .+\n)/m, `$1${imp}`);
    }
    if (!/mountCandidateFilePage\s*\(/.test(src)) {
      const call = "\nmountCandidateFilePage(app);\n";
      if (/app\.listen\(/.test(src)) {
        src = src.replace(/app\.listen\(/, `${call}app.listen(`);
      } else {
        src += call;
      }
    }
    console.log("Mounted candidate-file page in", path.basename(serverPath));
  }

  fs.writeFileSync(serverPath, src, "utf8");
  console.log("Backup:", bak);
  return true;
}

const servers = ["server.js", "gina.js"]
  .map((n) => path.join(ginaDir, n))
  .filter((p) => fs.existsSync(p));

if (!servers.length) {
  console.error("No server.js/gina.js found under", ginaDir);
  process.exit(2);
}
for (const s of servers) ensureMount(s);

console.log(`
Next:
  cd ${ginaDir}
  git add lib/candidate-files.js routes/candidate-files.js candidate-file-page.route.js frontend/public/candidate-file.html frontend/candidate-file.html server.js gina.js
  git status
  git commit -m "Add Candidate File handoff (Gina → Maria → Michelle → client)"
  git push origin main

Railway Redeploy. Open:
  https://lyday-gina-backend-production.up.railway.app/candidate-file
`);
