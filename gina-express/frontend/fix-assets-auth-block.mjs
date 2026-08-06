#!/usr/bin/env node
/**
 * Fix: React never mounted (#root empty) because /assets/*.js returned the
 * Sign In HTML (auth middleware) instead of JavaScript.
 *
 * 1) Copies hardened authApp.js (exempts /assets + static files)
 * 2) Ensures express.static(frontend/dist) is mounted BEFORE requireAppAuth
 *
 *   node gina-express/frontend/fix-assets-auth-block.mjs ~/lyday-gina-backend/gina-backend
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootArg = String(process.argv[2] || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");
if (!rootArg) {
  console.error(
    "Usage: node fix-assets-auth-block.mjs ~/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

const root = path.resolve(rootArg);
const ginaDir = fs.existsSync(path.join(root, "server.js"))
  ? root
  : fs.existsSync(path.join(root, "gina-backend", "server.js"))
    ? path.join(root, "gina-backend")
    : root;

const kitAuth = path.join(__dirname, "..", "authApp.js");
if (!fs.existsSync(kitAuth)) {
  console.error("Missing kit authApp.js:", kitAuth);
  process.exit(2);
}

// Locate authApp.js in Gina
const authCandidates = [
  path.join(ginaDir, "authApp.js"),
  path.join(ginaDir, "middleware", "authApp.js"),
  path.join(ginaDir, "lib", "authApp.js"),
];
let authPath = authCandidates.find((p) => fs.existsSync(p));
if (!authPath) {
  authPath = path.join(ginaDir, "authApp.js");
  console.warn("authApp.js not found — writing new file at", authPath);
}
const authBak = `${authPath}.bak-assets-auth-${Date.now()}`;
if (fs.existsSync(authPath)) fs.copyFileSync(authPath, authBak);
fs.copyFileSync(kitAuth, authPath);
console.log("Wrote", authPath);
if (fs.existsSync(authBak)) console.log("Backup:", authBak);

// Ensure server.js serves dist BEFORE auth when possible
const serverPath = path.join(ginaDir, "server.js");
if (!fs.existsSync(serverPath)) {
  console.warn("server.js not found — authApp updated only");
  process.exit(0);
}

let server = fs.readFileSync(serverPath, "utf8");
const sbak = `${serverPath}.bak-assets-auth-${Date.now()}`;
fs.copyFileSync(serverPath, sbak);

const staticSnippet = `
// STATIC ASSETS BEFORE AUTH — /assets/*.js must not return Sign In HTML
const __ginaDist = path.join(__dirname, "frontend", "dist");
if (typeof express !== "undefined" && fs.existsSync(__ginaDist)) {
  app.use(express.static(__ginaDist, { index: false, fallthrough: true }));
}
`.trim();

let changed = false;

// Ensure path + fs imports
if (!/from\s+["']path["']|require\(["']path["']\)/.test(server)) {
  if (/^import\s+/m.test(server)) {
    server = `import path from "path";\n` + server;
  } else {
    server = `const path = require("path");\n` + server;
  }
  changed = true;
}
if (!/\bfs\b/.test(server.split("\n").slice(0, 40).join("\n"))) {
  if (/^import\s+/m.test(server)) {
    server = `import fs from "fs";\n` + server;
  } else {
    server = `const fs = require("fs");\n` + server;
  }
  changed = true;
}

if (!/STATIC ASSETS BEFORE AUTH/.test(server)) {
  // Prefer inserting immediately after `const app = express()`
  if (/const\s+app\s*=\s*express\s*\(\s*\)\s*;?/.test(server)) {
    server = server.replace(
      /(const\s+app\s*=\s*express\s*\(\s*\)\s*;?)/,
      `$1\n${staticSnippet}\n`,
    );
    changed = true;
    console.log("Mounted express.static(dist) right after express()");
  } else if (/requireAppAuth/.test(server)) {
    server = server.replace(
      /app\.use\(\s*requireAppAuth\s*\)/,
      `${staticSnippet}\napp.use(requireAppAuth)`,
    );
    changed = true;
    console.log("Mounted express.static(dist) before requireAppAuth");
  } else {
    console.warn("Could not auto-insert static mount — authApp exempt still helps");
  }
} else {
  console.log("STATIC ASSETS BEFORE AUTH already present");
}

if (changed) {
  fs.writeFileSync(serverPath, server, "utf8");
  console.log("Wrote", serverPath);
  console.log("Backup:", sbak);
} else {
  try {
    fs.unlinkSync(sbak);
  } catch {
    /* ignore */
  }
}

console.log(`
Next:
  cd ${path.dirname(ginaDir) === ginaDir ? ginaDir : path.dirname(ginaDir)}
  # if gina-backend is nested:
  cd ~/lyday-gina-backend
  git add gina-backend/authApp.js gina-backend/server.js \\
    gina-backend/middleware/authApp.js 2>/dev/null
  git add -f gina-backend/frontend/dist
  git status
  git commit -m "Fix empty #root: serve /assets before auth"
  git pull origin main --rebase && git push origin main

After Railway redeploy: hard refresh, sign in again.
/assets/index-*.js must show JavaScript, not the Sign In page.
`);
