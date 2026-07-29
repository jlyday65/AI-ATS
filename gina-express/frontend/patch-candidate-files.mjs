#!/usr/bin/env node
/**
 * Mount Candidate Files on Gina server.js ONLY (never gina.js).
 * Mirrors Kimberley Notes embed patch (ESM).
 *
 * ONE LINE:
 *   node gina-express/frontend/patch-candidate-files.mjs ~/lyday-gina-backend/gina-backend
 *
 * If site is 502, run rollback first:
 *   node gina-express/frontend/rollback-candidate-files.mjs ~/lyday-gina-backend/gina-backend
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
    "Usage (one line): node patch-candidate-files.mjs ~/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

const serverHead = fs.readFileSync(serverPath, "utf8").slice(0, 1500);
const isCjs =
  /\brequire\s*\(/.test(serverHead) && !/^import\s+/m.test(serverHead);
if (isCjs) {
  console.error(
    "server.js looks CommonJS. This patch is ESM-only (same as Kimberley Notes).",
  );
  console.error(
    "Run rollback-candidate-files.mjs first if you are on a 502, then confirm server uses import.",
  );
  process.exit(2);
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

// Page path is /candidate-file only — do NOT use /candidate-files (API list lives there under /ats)
const pageRoute = `/** AUTO: candidate-file HTML page (embedded) */
const HTML = ${JSON.stringify(html)};

export function mountCandidateFilePage(app) {
  const send = (_req, res) => {
    res.status(200).type("html").send(HTML);
  };
  app.get("/candidate-file", send);
  app.get("/candidate-file.html", send);
  console.log("[candidate-file] page route: /candidate-file");
}

export default mountCandidateFilePage;
`;
fs.writeFileSync(
  path.join(ginaDir, "candidate-file-page.route.js"),
  pageRoute,
  "utf8",
);
console.log("Wrote candidate-file-page.route.js");

function scrubCandidateMounts(src) {
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

// Scrub gina.js if the old patch polluted it (common 502 cause)
const ginaPath = path.join(ginaDir, "gina.js");
if (fs.existsSync(ginaPath)) {
  const before = fs.readFileSync(ginaPath, "utf8");
  const after = scrubCandidateMounts(before);
  if (after !== before) {
    const gbak = `${ginaPath}.bak-cf-scrub-${Date.now()}`;
    fs.copyFileSync(ginaPath, gbak);
    fs.writeFileSync(ginaPath, after, "utf8");
    console.log("Scrubbed broken Candidate File mounts from gina.js");
    console.log("Backup:", gbak);
  }
}

let src = scrubCandidateMounts(fs.readFileSync(serverPath, "utf8"));
const bak = `${serverPath}.bak-candidate-files-${Date.now()}`;
fs.copyFileSync(serverPath, bak);

const importRouter =
  `import { createCandidateFilesRouter } from "./routes/candidate-files.js";\n`;
const importPage =
  `import { mountCandidateFilePage } from "./candidate-file-page.route.js";\n`;

// Place imports with other imports (not only at top if scrubbed)
if (/^import\s+/m.test(src)) {
  src = src.replace(/(^import\s.+;\s*\n)/m, `$1${importRouter}${importPage}`);
} else {
  src = importRouter + importPage + src;
}

const mountBlock = `mountCandidateFilePage(app);
app.use("/ats", createCandidateFilesRouter());
console.log("[candidate-files] mounted /candidate-file + /ats/candidate-files");
`;

// CRITICAL: mount BEFORE SPA catch-all (app.get("*") / sendFile index.html),
// otherwise /candidate-file serves the ATS board.
let mounted = false;
if (/const\s+app\s*=\s*express\s*\(/.test(src)) {
  src = src.replace(
    /(const\s+app\s*=\s*express\s*\(\s*\)\s*;?)/,
    `$1\n${mountBlock}`,
  );
  mounted = /mountCandidateFilePage\s*\(\s*app\s*\)/.test(src);
}

// Also insert immediately before any catch-all if not already early enough
if (
  /app\.get\(\s*["'`](\*|\/\*|\/\.\*)["'`]/i.test(src) &&
  /mountCandidateFilePage/.test(src)
) {
  // Move mount to just before catch-all by removing existing mounts and re-inserting
  src = src.replace(/\n?\s*mountCandidateFilePage\s*\(\s*app\s*\)\s*;\s*\n?/g, "\n");
  src = src.replace(
    /\n?\s*app\.use\(\s*["']\/ats["']\s*,\s*createCandidateFilesRouter\s*\(\s*\)\s*\)\s*;\s*\n?/g,
    "\n",
  );
  src = src.replace(
    /\n?\s*console\.log\(\s*["']\[candidate-files\][^"']*["']\s*\)\s*;\s*\n?/g,
    "\n",
  );
  src = src.replace(
    /(app\.get\(\s*["'`](?:\*|\/\*|\/\.\*)["'`])/i,
    `${mountBlock}\n$1`,
  );
  mounted = true;
}

if (!mounted) {
  if (/app\.listen\s*\(/.test(src)) {
    src = src.replace(/app\.listen\s*\(/, `${mountBlock}\napp.listen(`);
    mounted = true;
  }
}

if (!/mountCandidateFilePage\s*\(\s*app\s*\)/.test(src)) {
  console.error("Failed to insert mountCandidateFilePage(app) before SPA catch-all");
  process.exit(2);
}

fs.writeFileSync(serverPath, src, "utf8");
console.log("Patched", serverPath);
console.log("Backup:", bak);

// Sanity: files exist for Railway
for (const rel of [
  "lib/candidate-files.js",
  "routes/candidate-files.js",
  "candidate-file-page.route.js",
]) {
  if (!fs.existsSync(path.join(ginaDir, rel))) {
    console.error("Missing required file:", rel);
    process.exit(2);
  }
}

console.log(`
VERIFY after redeploy:
  1) https://lyday-gina-backend-production.up.railway.app/ats/candidate-files
     → JSON like {"ok":true,"files":[]}
  2) https://lyday-gina-backend-production.up.railway.app/candidate-file
     → page titled "Candidate File" (NOT the ATS board)

Next:
  cd ~/lyday-gina-backend
  git add gina-backend/lib/candidate-files.js gina-backend/routes/candidate-files.js gina-backend/candidate-file-page.route.js gina-backend/frontend/public/candidate-file.html gina-backend/frontend/candidate-file.html gina-backend/server.js
  git status
  git commit -m "Mount Candidate File before ATS SPA catch-all"
  git push origin main
`);
