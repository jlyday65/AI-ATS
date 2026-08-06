#!/usr/bin/env node
/**
 * Nuclear fix for Railway 404: INLINE Kimberley Notes routes into server.js
 * (no separate import that can fail / wrong entrypoint).
 *
 * Also writes the same mount into gina.js if present (some deploys boot gina.js).
 *
 * Usage:
 *   node gina-express/frontend/patch-inline-kimberley-notes.mjs \
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
    "Usage: node patch-inline-kimberley-notes.mjs /Users/jameslyday/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

const ginaDir = fs.existsSync(path.join(root, "server.js"))
  ? root
  : fs.existsSync(path.join(root, "gina-backend", "server.js"))
    ? path.join(root, "gina-backend")
    : root;

const htmlPath = path.join(__dirname, "kimberley-notes.html");
const html = fs.readFileSync(htmlPath, "utf8");
const htmlLiteral = JSON.stringify(html);

const BLOCK_START = "/* === KIMBERLEY_NOTES_EMBED_START === */";
const BLOCK_END = "/* === KIMBERLEY_NOTES_EMBED_END === */";

const block = `
${BLOCK_START}
;(function mountKimberleyNotesInline(appRef) {
  try {
    const app = appRef || (typeof globalThis !== "undefined" && globalThis.app) || null;
    if (!app || typeof app.get !== "function") {
      console.error("[kimberley-notes] inline mount skipped: no app");
      return;
    }
    const HTML = ${htmlLiteral};
    const send = function (_req, res) {
      res.status(200).type("html").send(HTML);
    };
    app.get("/kimberley-notes.html", send);
    app.get("/kimberley-notes", send);
    app.get("/notes", send);
    console.log("[kimberley-notes] INLINE routes ready: /notes /kimberley-notes /kimberley-notes.html");
  } catch (err) {
    console.error("[kimberley-notes] inline mount failed", err);
  }
})(typeof app !== "undefined" ? app : null);
${BLOCK_END}
`;

function stripOld(src) {
  // Remove prior embed markers
  src = src.replace(
    /\/\* === KIMBERLEY_NOTES_EMBED_START === \*\/[\s\S]*?\/\* === KIMBERLEY_NOTES_EMBED_END === \*\//g,
    "",
  );
  // Remove previous helper mounts/imports
  src = src.replace(
    /\n?import\s*\{\s*mountKimberleyNotesEmbedded\s*\}\s*from\s*["']\.\/kimberley-notes-page\.route\.js["'];\s*\n?/g,
    "\n",
  );
  src = src.replace(
    /\n?const\s*\{\s*mountKimberleyNotesEmbedded\s*\}\s*=\s*require\(["']\.\/kimberley-notes-page\.route\.cjs["']\);\s*\n?/g,
    "\n",
  );
  src = src.replace(/\n?\s*mountKimberleyNotesEmbedded\s*\(\s*app\s*\)\s*;\s*\n?/g, "\n");
  src = src.replace(
    /\n?import\s*\{\s*mountKimberleyNotesPage\s*\}\s*from\s*["']\.\/serve-kimberley-notes-page\.js["'];\s*\n?/g,
    "\n",
  );
  src = src.replace(/\n?\s*mountKimberleyNotesPage\s*\(\s*app\s*\)\s*;\s*\n?/g, "\n");
  return src;
}

function inject(src, fileLabel) {
  src = stripOld(src);
  if (/const\s+app\s*=\s*express\s*\(/.test(src)) {
    src = src.replace(
      /(const\s+app\s*=\s*express\s*\(\s*\)\s*;?)/,
      `$1\n${block}`,
    );
    console.log(fileLabel + ": injected after const app = express()");
  } else if (/app\.listen\s*\(/.test(src)) {
    src = src.replace(/app\.listen\s*\(/, `${block}\napp.listen(`);
    console.log(fileLabel + ": injected before app.listen");
  } else if (/export\s+default\s+app/.test(src)) {
    src = src.replace(/export\s+default\s+app/, `${block}\nexport default app`);
    console.log(fileLabel + ": injected before export default app");
  } else {
    src = src + "\n" + block + "\n";
    console.log(fileLabel + ": appended at end of file");
  }
  if (!src.includes("KIMBERLEY_NOTES_EMBED_START")) {
    throw new Error("inject failed for " + fileLabel);
  }
  return src;
}

const targets = ["server.js", "index.js", "app.js", "gina.js"]
  .map((n) => path.join(ginaDir, n))
  .filter((p) => fs.existsSync(p));

if (!targets.length) {
  console.error("No server.js/index.js/app.js/gina.js under", ginaDir);
  process.exit(2);
}

for (const file of targets) {
  const bak = `${file}.bak-inline-notes-${Date.now()}`;
  fs.copyFileSync(file, bak);
  const next = inject(fs.readFileSync(file, "utf8"), path.basename(file));
  fs.writeFileSync(file, next, "utf8");
  console.log("Wrote", file, "(backup", bak + ")");
}

console.log(`
IMPORTANT diagnostics before commit:
  rg -n "KIMBERLEY_NOTES_EMBED_START|/notes" ${path.join(ginaDir, "server.js")} ${path.join(ginaDir, "gina.js")} 2>/dev/null | head

Commit ALL patched boot files:
  cd ${fs.existsSync(path.join(path.dirname(ginaDir), ".git")) ? path.dirname(ginaDir) : ginaDir}
  git add gina-backend/server.js gina-backend/gina.js gina-backend/index.js gina-backend/app.js
  git status
  git commit -m "Inline Kimberley Notes routes into server boot files"
  git push origin main

Railway checklist:
  1) Settings → Root Directory = gina-backend  (NOT "gina-backend 3" or "4")
  2) Redeploy
  3) Deploy logs must contain: [kimberley-notes] INLINE routes ready
  4) Open https://gina-backend.up.railway.app/notes

If logs lack that line, Railway is not booting the file we patched — paste your Railway Start Command + Root Directory.
`);
