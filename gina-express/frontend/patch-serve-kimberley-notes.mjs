#!/usr/bin/env node
/**
 * Fix 404 on https://gina-backend.up.railway.app/kimberley-notes.html
 *
 * Copies the HTML into frontend/public (+ dist if present) and mounts an
 * Express route in server.js. Does NOT touch App.jsx.
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

const serverPath = ["server.js", "index.js"]
  .map((n) => path.join(ginaDir, n))
  .find((p) => fs.existsSync(p));
if (!serverPath) {
  console.error("Could not find server.js under", ginaDir);
  process.exit(2);
}

const htmlSrc = path.join(__dirname, "kimberley-notes.html");
const serveSrc = path.join(__dirname, "..", "serve-kimberley-notes-page.js");
if (!fs.existsSync(htmlSrc) || !fs.existsSync(serveSrc)) {
  console.error("Missing kimberley-notes.html or serve-kimberley-notes-page.js in AI-ATS");
  process.exit(2);
}

const publicHtml = path.join(ginaDir, "frontend", "public", "kimberley-notes.html");
const distHtml = path.join(ginaDir, "frontend", "dist", "kimberley-notes.html");
const serveDest = path.join(ginaDir, "serve-kimberley-notes-page.js");

fs.mkdirSync(path.dirname(publicHtml), { recursive: true });
fs.copyFileSync(htmlSrc, publicHtml);
fs.copyFileSync(serveSrc, serveDest);
console.log("Wrote", publicHtml);
console.log("Wrote", serveDest);
if (fs.existsSync(path.join(ginaDir, "frontend", "dist"))) {
  fs.copyFileSync(publicHtml, distHtml);
  console.log("Wrote", distHtml);
}

let src = fs.readFileSync(serverPath, "utf8");
if (/mountKimberleyNotesPage|serve-kimberley-notes-page/.test(src)) {
  console.log("server.js already mounts Kimberley Notes page");
} else {
  const bak = `${serverPath}.bak-notes-static-${Date.now()}`;
  fs.copyFileSync(serverPath, bak);

  const isCjs = /\brequire\s*\(/.test(src) && !/^import\s+/m.test(src);
  let importLine;
  let mountLine;
  if (isCjs) {
    importLine = `const { mountKimberleyNotesPage } = require("./serve-kimberley-notes-page.cjs");\n`;
    // Also write a tiny CJS wrapper
    fs.writeFileSync(
      path.join(ginaDir, "serve-kimberley-notes-page.cjs"),
      `const fs = require("fs");
const path = require("path");
const express = require("express");

function mountKimberleyNotesPage(app) {
  const dist = path.join(__dirname, "frontend", "dist");
  const pub = path.join(__dirname, "frontend", "public");
  try { app.use(express.static(dist)); } catch (_) {}
  try { app.use(express.static(pub)); } catch (_) {}
  app.get("/kimberley-notes.html", (req, res) => {
    const files = [path.join(dist, "kimberley-notes.html"), path.join(pub, "kimberley-notes.html")];
    for (const f of files) {
      if (fs.existsSync(f)) return res.sendFile(f);
    }
    res.status(404).type("text").send("Kimberley Notes HTML missing on server");
  });
}
module.exports = { mountKimberleyNotesPage };
`,
      "utf8",
    );
    mountLine = `mountKimberleyNotesPage(app);\n`;
  } else {
    importLine = `import { mountKimberleyNotesPage } from "./serve-kimberley-notes-page.js";\n`;
    mountLine = `mountKimberleyNotesPage(app);\n`;
  }

  if (/^import\s+/m.test(src)) {
    src = src.replace(/(^import\s.+;\s*\n)/m, `$1${importLine}`);
  } else if (/require\(/.test(src)) {
    src = importLine + src;
  } else {
    src = importLine + src;
  }

  if (/const\s+app\s*=\s*express\s*\(/.test(src)) {
    src = src.replace(
      /(const\s+app\s*=\s*express\s*\(\s*\)\s*;?)/,
      `$1\n${mountLine}`,
    );
  } else if (/app\.listen\(/.test(src)) {
    src = src.replace(/app\.listen\(/, `${mountLine}app.listen(`);
  } else {
    src += `\n${mountLine}\n`;
  }

  fs.writeFileSync(serverPath, src, "utf8");
  console.log("Patched", serverPath);
  console.log("Backup", bak);
}

console.log(`
Next (one command per line):
  cd ${path.join(ginaDir, "frontend")}
  npm run build
  cd ${path.dirname(ginaDir)}
  git add gina-backend/server.js gina-backend/serve-kimberley-notes-page.js gina-backend/frontend/public/kimberley-notes.html
  git add gina-backend/serve-kimberley-notes-page.cjs
  git status
  git commit -m "Serve /kimberley-notes.html from Express"
  git push origin main

Railway Redeploy, then open:
  https://gina-backend.up.railway.app/kimberley-notes.html
`);
