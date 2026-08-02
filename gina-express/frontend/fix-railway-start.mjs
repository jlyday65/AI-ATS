#!/usr/bin/env node
/**
 * Fix Railway Railpack: "No start command detected"
 *
 * Ensures gina-backend/package.json has scripts.start and writes railway.json.
 * Prints the exact Railway UI settings to use.
 *
 * ONE LINE:
 *   node gina-express/frontend/fix-railway-start.mjs ~/lyday-gina-backend/gina-backend
 *
 * Or from the monorepo root:
 *   node gina-express/frontend/fix-railway-start.mjs ~/lyday-gina-backend
 */

import fs from "fs";
import path from "path";

const raw = String(process.argv[2] || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");
if (!raw) {
  console.error(
    "Usage: node fix-railway-start.mjs ~/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

const arg = path.resolve(raw);

function findGinaApp(root) {
  const candidates = [
    root,
    path.join(root, "gina-backend"),
    path.join(root, "gina-backend", "gina-backend"),
  ];
  for (const dir of candidates) {
    const pkg = path.join(dir, "package.json");
    const server = path.join(dir, "server.js");
    if (fs.existsSync(pkg) && fs.existsSync(server)) return dir;
  }
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
  }
  return null;
}

const appDir = findGinaApp(arg);
if (!appDir) {
  console.error("Could not find package.json + server.js under:", arg);
  console.error("Looked for:");
  console.error("  ", arg);
  console.error("  ", path.join(arg, "gina-backend"));
  console.error("");
  console.error("List what you have:");
  console.error("  ls -la ~/lyday-gina-backend");
  console.error("  ls -la ~/lyday-gina-backend/gina-backend");
  process.exit(2);
}

const pkgPath = path.join(appDir, "package.json");
const serverPath = path.join(appDir, "server.js");
const railwayPath = path.join(appDir, "railway.json");

let pkg;
try {
  pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
} catch (e) {
  console.error("Bad package.json:", e.message);
  process.exit(2);
}

pkg.scripts = pkg.scripts || {};
const before = pkg.scripts.start || null;

if (!pkg.scripts.start) {
  if (fs.existsSync(serverPath)) {
    pkg.scripts.start = "node server.js";
  } else if (pkg.main) {
    pkg.scripts.start = `node ${pkg.main}`;
  } else {
    pkg.scripts.start = "node server.js";
  }
}

if (!pkg.main && fs.existsSync(serverPath)) {
  pkg.main = "server.js";
}

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
console.log("package.json:", pkgPath);
console.log("  start was:", before || "(missing)");
console.log("  start now:", pkg.scripts.start);
console.log("  main:", pkg.main || "(none)");

const railway = {
  $schema: "https://railway.com/railway.schema.json",
  build: { builder: "RAILPACK" },
  deploy: {
    startCommand: "npm start",
    restartPolicyType: "ON_FAILURE",
  },
};
fs.writeFileSync(railwayPath, JSON.stringify(railway, null, 2) + "\n", "utf8");
console.log("Wrote", railwayPath);

const self = path.basename(appDir);
const rootDirHint = self === "gina-backend" ? "gina-backend" : self;

console.log(`
═══════════════════════════════════════════════════════════
RAILWAY UI — set these on the GINA service, then Redeploy
═══════════════════════════════════════════════════════════

  Service → Settings:

  1) Root Directory   =  ${rootDirHint}
     (must be the folder that CONTAINS package.json + server.js)
     NOT blank monorepo root, NOT gina-express, NOT AI-ATS.

  2) Custom Start Command  =  npm start
     (or: ${pkg.scripts.start})

  3) Confirm the service is linked to repo: lyday-gina-backend
     (NOT jlyday65/AI-ATS — that kit has no Gina server.js)

═══════════════════════════════════════════════════════════
COMMIT + PUSH from your Mac
═══════════════════════════════════════════════════════════

  cd ~/lyday-gina-backend
  git add gina-backend/package.json gina-backend/railway.json
  git status
  git commit -m "Railway: ensure npm start + railway.json for Railpack"
  git pull origin main --rebase
  git push origin main

Then Railway → Redeploy (or wait for auto-deploy).

If it STILL fails, paste from Settings:
  - Root Directory value
  - Start Command value
  - Connected repo name
`);
