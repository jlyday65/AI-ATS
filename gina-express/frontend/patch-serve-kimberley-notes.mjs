#!/usr/bin/env node
/**
 * Make Gina serve /kimberley-notes.html (fixes Railway 404).
 * Does NOT touch App.jsx.
 *
 * Usage:
 *   node gina-express/frontend/patch-serve-kimberley-notes.mjs \
 *     /Users/jameslyday/lyday-gina-backend/gina-backend
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(
  String(process.argv[2] || "").replace(/^~/, process.env.HOME || "").trim(),
);
if (!root || !fs.existsSync(root)) {
  console.error(
    "Usage: node patch-serve-kimberley-notes.mjs /Users/jameslyday/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

const ginaDir = fs.existsSync(path.join(root, "server.js"))
  ? root
  : fs.existsSync(path.join(root, "gina-backend", "server.js"))
    ? path.join(root, "gina-backend")
    : root;

const serverPath = ["server.js", "index.js", "app.js"]
  .map((n) => path.join(ginaDir, n))
  .find((p) => fs.existsSync(p));

if (!serverPath) {
  console.error("Could not find server.js under", ginaDir);
  process.exit(2);
}

// Ensure HTML exists in public + dist (local)
const htmlSrc = path.join(__dirname, "kimberley-notes.html");
const publicHtml = path.join(ginaDir, "frontend", "public", "kimberley-notes.html");
const distHtml = path.join(ginaDir, "frontend", "dist", "kimberley-notes.html");
fs.mkdirSync(path.dirname(publicHtml), { recursive: true });
if (fs.existsSync(htmlSrc)) {
  fs.copyFileSync(htmlSrc, publicHtml);
  console.log("Ensured", publicHtml);
}
if (fs.existsSync(path.dirname(distHtml))) {
  fs.copyFileSync(publicHtml, distHtml);
  console.log("Ensured", distHtml);
}

let src = fs.readFileSync(serverPath, "utf8");
const bak = `${serverPath}.bak-notes-static-${Date.now()}`;
fs.copyFileSync(serverPath, bak);

if (/kimberley-notes\.html/.test(src) && /sendFile|express\.static/.test(src)) {
  console.log("server already mentions kimberley-notes — leaving as-is:", serverPath);
} else {
  const snippet = `
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDist = path.join(__dirname, "frontend", "dist");
const frontendPublic = path.join(__dirname, "frontend", "public");

// Serve built frontend (includes kimberley-notes.html from public/ → dist/)
app.use(express.static(frontendDist));
app.use(express.static(frontendPublic));

app.get("/kimberley-notes.html", (req, res) => {
  const candidates = [
    path.join(frontendDist, "kimberley-notes.html"),
    path.join(frontendPublic, "kimberley-notes.html"),
    path.join(__dirname, "frontend", "public", "kimberley-notes.html"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return res.sendFile(file);
  }
  res.status(404).send("Kimberley Notes page not found on server. Ensure frontend/public/kimberley-notes.html is deployed and frontend was built.");
});
`;

  // Avoid duplicate path/fs imports if present — inject a simpler block without re-import when possible
  const simple = `
// --- Kimberley Notes static page ---
import fs from "fs";
import path from "path";
import { fileURLToPath as __kimberleyFileURLToPath } from "url";
const __kimberleyDir = path.dirname(__kimberleyFileURLToPath(import.meta.url));
const __kimberleyDist = path.join(__kimberleyDir, "frontend", "dist");
const __kimberleyPublic = path.join(__kimberleyDir, "frontend", "public");
try { app.use(express.static(__kimberleyDist)); } catch (_) {}
try { app.use(express.static(__kimberleyPublic)); } catch (_) {}
app.get("/kimberley-notes.html", (req, res) => {
  const files = [
    path.join(__kimberleyDist, "kimberley-notes.html"),
    path.join(__kimberleyPublic, "kimberley-notes.html"),
  ];
  for (const f of files) {
    if (fs.existsSync(f)) return res.sendFile(f);
  }
  res.status(404).type("text").send("Kimberley Notes HTML missing. Build frontend and deploy frontend/public/kimberley-notes.html");
});
// --- end Kimberley Notes static page ---
`;

  // Prefer inserting after app = express() or first app.use
  if (/const\s+app\s*=\s*express\s*\(/.test(src)) {
    src = src.replace(
      /(const\s+app\s*=\s*express\s*\(\s*\)\s*;?)/,
      `$1\n${simple}`,
    );
  } else if (/app\.use\(/.test(src)) {
    src = src.replace(/app\.use\(/, `${simple}\napp.use(`);
  } else {
    src = src + "\n" + simple + "\n";
  }

  // If file is CJS (require) not ESM, rewrite imports
  if (/\brequire\s*\(/.test(src) && !/import\s+/.test(src.slice(0, 500))) {
    src = src.replace(
      simple,
      `
// --- Kimberley Notes static page ---
const fs = require("fs");
const path = require("path");
const __kimberleyDist = path.join(__dirname, "frontend", "dist");
const __kimberleyPublic = path.join(__dirname, "frontend", "public");
try { app.use(express.static(__kimberleyDist)); } catch (_) {}
try { app.use(express.static(__kimberleyPublic)); } catch (_) {}
app.get("/kimberley-notes.html", (req, res) => {
  const files = [
    path.join(__kimberleyDist, "kimberley-notes.html"),
    path.join(__kimberleyPublic, "kimberley-notes.html"),
  ];
  for (const f of files) {
    if (fs.existsSync(f)) return res.sendFile(f);
  }
  res.status(404).type("text").send("Kimberley Notes HTML missing. Build frontend and deploy frontend/public/kimberley-notes.html");
});
// --- end Kimberley Notes static page ---
`,
    );
  }

  fs.writeFileSync(serverPath, src, "utf8");
  console.log("Patched", serverPath);
  console.log("Backup", bak);
}

console.log(`
Next:
  cd ${path.join(ginaDir, "frontend")} && npm run build
  cd ${path.dirname(ginaDir)}
  git add gina-backend/server.js gina-backend/frontend/public/kimberley-notes.html
  git status
  git commit -m "Serve /kimberley-notes.html from Express static"
  git push origin main

Railway Redeploy, then open:
  https://gina-backend.up.railway.app/kimberley-notes.html
`);
