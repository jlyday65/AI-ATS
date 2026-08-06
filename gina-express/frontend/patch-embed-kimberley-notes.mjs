#!/usr/bin/env node
/**
 * Fix Railway 404 for Kimberley Notes by embedding the HTML in a JS route.
 * No dependency on frontend/dist or public being present on the server.
 * Does NOT touch App.jsx.
 *
 * Usage:
 *   node gina-express/frontend/patch-embed-kimberley-notes.mjs \
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
    "Usage: node patch-embed-kimberley-notes.mjs /Users/jameslyday/lyday-gina-backend/gina-backend",
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

const htmlPath = path.join(__dirname, "kimberley-notes.html");
if (!fs.existsSync(htmlPath)) {
  console.error("Missing", htmlPath);
  process.exit(2);
}

const html = fs.readFileSync(htmlPath, "utf8");
const isCjs =
  /\brequire\s*\(/.test(fs.readFileSync(serverPath, "utf8")) &&
  !/^import\s+/m.test(fs.readFileSync(serverPath, "utf8").slice(0, 800));

const routeFile = isCjs
  ? path.join(ginaDir, "kimberley-notes-page.route.cjs")
  : path.join(ginaDir, "kimberley-notes-page.route.js");

const routeBody = isCjs
  ? `const HTML = ${JSON.stringify(html)};

function mountKimberleyNotesEmbedded(app) {
  const send = (_req, res) => {
    res.status(200).type("html").send(HTML);
  };
  app.get("/kimberley-notes.html", send);
  app.get("/kimberley-notes", send);
  app.get("/notes", send);
  console.log("[kimberley-notes] embedded page routes: /kimberley-notes.html /kimberley-notes /notes");
}

module.exports = { mountKimberleyNotesEmbedded };
`
  : `const HTML = ${JSON.stringify(html)};

export function mountKimberleyNotesEmbedded(app) {
  const send = (_req, res) => {
    res.status(200).type("html").send(HTML);
  };
  app.get("/kimberley-notes.html", send);
  app.get("/kimberley-notes", send);
  app.get("/notes", send);
  console.log("[kimberley-notes] embedded page routes: /kimberley-notes.html /kimberley-notes /notes");
}

export default mountKimberleyNotesEmbedded;
`;

fs.writeFileSync(routeFile, routeBody, "utf8");
console.log("Wrote embedded route:", routeFile, `(${routeBody.length} bytes)`);

// Also keep a public copy for local vite if useful
const publicHtml = path.join(ginaDir, "frontend", "public", "kimberley-notes.html");
fs.mkdirSync(path.dirname(publicHtml), { recursive: true });
fs.copyFileSync(htmlPath, publicHtml);

let src = fs.readFileSync(serverPath, "utf8");
const bak = `${serverPath}.bak-embed-notes-${Date.now()}`;
fs.copyFileSync(serverPath, bak);

// Remove prior broken mounts to avoid duplicates
src = src.replace(
  /\n?import\s*\{\s*mountKimberleyNotesPage\s*\}\s*from\s*["']\.\/serve-kimberley-notes-page\.js["'];\s*\n?/g,
  "\n",
);
src = src.replace(
  /\n?const\s*\{\s*mountKimberleyNotesPage\s*\}\s*=\s*require\(["']\.\/serve-kimberley-notes-page\.cjs["']\);\s*\n?/g,
  "\n",
);
src = src.replace(/\n?\s*mountKimberleyNotesPage\s*\(\s*app\s*\)\s*;\s*\n?/g, "\n");
src = src.replace(
  /\n?import\s*\{\s*mountKimberleyNotesEmbedded\s*\}\s*from\s*["']\.\/kimberley-notes-page\.route\.js["'];\s*\n?/g,
  "\n",
);
src = src.replace(
  /\n?const\s*\{\s*mountKimberleyNotesEmbedded\s*\}\s*=\s*require\(["']\.\/kimberley-notes-page\.route\.cjs["']\);\s*\n?/g,
  "\n",
);
src = src.replace(/\n?\s*mountKimberleyNotesEmbedded\s*\(\s*app\s*\)\s*;\s*\n?/g, "\n");

const importLine = isCjs
  ? `const { mountKimberleyNotesEmbedded } = require("./kimberley-notes-page.route.cjs");\n`
  : `import { mountKimberleyNotesEmbedded } from "./kimberley-notes-page.route.js";\n`;
const mountLine = `mountKimberleyNotesEmbedded(app);\n`;

if (isCjs) {
  // after last require block
  if (/require\(/.test(src)) {
    const lines = src.split("\n");
    let lastReq = 0;
    for (let i = 0; i < Math.min(lines.length, 80); i++) {
      if (/require\(/.test(lines[i])) lastReq = i;
    }
    lines.splice(lastReq + 1, 0, importLine.trimEnd());
    src = lines.join("\n");
  } else {
    src = importLine + src;
  }
} else if (/^import\s+/m.test(src)) {
  src = src.replace(/(^import\s.+;\s*\n)/m, `$1${importLine}`);
} else {
  src = importLine + src;
}

// Mount ASAP after app creation, before listen / catch-alls
if (/const\s+app\s*=\s*express\s*\(/.test(src)) {
  src = src.replace(
    /(const\s+app\s*=\s*express\s*\(\s*\)\s*;?)/,
    `$1\n${mountLine}`,
  );
} else if (/app\.listen\s*\(/.test(src)) {
  src = src.replace(/app\.listen\s*\(/, `${mountLine}app.listen(`);
} else {
  src += `\n${mountLine}\n`;
}

if (!/mountKimberleyNotesEmbedded\s*\(\s*app\s*\)/.test(src)) {
  console.error("Failed to insert mountKimberleyNotesEmbedded(app)");
  process.exit(2);
}

fs.writeFileSync(serverPath, src, "utf8");
console.log("Patched", serverPath);
console.log("Backup", bak);

const gitRoot = fs.existsSync(path.join(path.dirname(ginaDir), ".git"))
  ? path.dirname(ginaDir)
  : ginaDir;
const rel = path.relative(gitRoot, ginaDir) || ".";

console.log(`
VERIFY locally (optional):
  node -e "import('./kimberley-notes-page.route.js').then(m=>console.log(Object.keys(m)))"
  # from ${ginaDir}

Commit (one line each):
  cd ${gitRoot}
  git add ${path.join(rel, path.basename(serverPath))}
  git add ${path.join(rel, path.basename(routeFile))}
  git add ${path.join(rel, "frontend/public/kimberley-notes.html")}
  git status
  git commit -m "Embed Kimberley Notes HTML route (fix Railway 404)"
  git push origin main

Railway Redeploy, wait until healthy, then try ALL of:
  https://gina-backend.up.railway.app/kimberley-notes.html
  https://gina-backend.up.railway.app/kimberley-notes
  https://gina-backend.up.railway.app/notes

If still 404, Railway Root Directory may not be gina-backend — check Railway settings.
`);
