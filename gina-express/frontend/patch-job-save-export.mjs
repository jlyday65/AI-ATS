#!/usr/bin/env node
/**
 * Mount Board + Candidate File Save/Export on Gina.
 *
 * ONE LINE:
 *   node gina-express/frontend/patch-job-save-export.mjs ~/lyday-gina-backend/gina-backend
 *
 * Then (optional toolbar button):
 *   node gina-express/frontend/patch-job-save-toolbar.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 *   cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
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
// dependency for candidate file merge
if (!fs.existsSync(path.join(ginaDir, "lib/candidate-files.js"))) {
  copyInto("lib/candidate-files.js", "lib/candidate-files.js");
}
if (!fs.existsSync(path.join(ginaDir, "routes/candidate-files.js"))) {
  copyInto("routes/candidate-files.js", "routes/candidate-files.js");
}
copyInto("frontend/job-save.html", "frontend/public/job-save.html");
copyInto("frontend/job-save.html", "frontend/job-save.html");

const html = fs.readFileSync(
  path.join(ginaDir, "frontend/public/job-save.html"),
  "utf8",
);

const pageRoute = `/** AUTO: job-save HTML page (embedded) */
const JOB_SAVE_HTML = ${JSON.stringify(html)};

export function mountJobSavePage(app) {
  const send = (_req, res) => {
    res.status(200).type("html").send(JOB_SAVE_HTML);
  };
  app.get("/job-save", send);
  app.get("/job-save.html", send);
  console.log("[job-save] page route: /job-save");
}

export default mountJobSavePage;
`;

fs.writeFileSync(
  path.join(ginaDir, "job-save-page.route.js"),
  pageRoute,
  "utf8",
);
console.log("Wrote job-save-page.route.js");

let server = fs.readFileSync(serverPath, "utf8");
const bak = `${serverPath}.bak-job-save-${Date.now()}`;
fs.copyFileSync(serverPath, bak);
console.log("Backup", path.basename(bak));

if (!/job-save-export/.test(server)) {
  if (!/from\s+["']\.\/routes\/job-save-export\.js["']/.test(server)) {
    server = `import jobSaveExportRouter from "./routes/job-save-export.js";\n` + server;
  }
  if (!/from\s+["']\.\/job-save-page\.route\.js["']/.test(server)) {
    server =
      `import { mountJobSavePage } from "./job-save-page.route.js";\n` + server;
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
  if (!/mountJobSavePage\s*\(/.test(server)) {
    if (/listen\s*\(/.test(server)) {
      server = server.replace(
        /((?:const|let|var)?\s*server\s*=\s*)?app\.listen\s*\(/,
        "mountJobSavePage(app);\n$&",
      );
    } else {
      server += `\nmountJobSavePage(app);\n`;
    }
  }
  fs.writeFileSync(serverPath, server, "utf8");
  console.log("Mounted /ats/job-save-export and /job-save");
} else {
  console.log("server.js already references job-save-export");
}

console.log(`
Next:
  1) Optional toolbar: node gina-express/frontend/patch-job-save-toolbar.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
  2) cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  3) commit/push Gina + ensure Railway SIGNALHIRE_BASE_URL + RELAY_SECRET
  4) AI-ATS must be running so talent-pool archive works for Maria reuse
`);
