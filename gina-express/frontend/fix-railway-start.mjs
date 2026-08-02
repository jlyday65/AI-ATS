#!/usr/bin/env node
/**
 * Fix Railway Railpack: "No start command detected"
 *
 * Diagnoses where package.json lives in the Gina git repo, ensures scripts.start
 * exists, writes railway.json, and (for nested monorepos) adds a ROOT package.json
 * so Railway works even when Root Directory is blank.
 *
 * ONE LINE:
 *   node gina-express/frontend/fix-railway-start.mjs ~/lyday-gina-backend
 */

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const raw = String(process.argv[2] || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");
if (!raw) {
  console.error(
    "Usage: node fix-railway-start.mjs ~/lyday-gina-backend\n" +
      "   or: node fix-railway-start.mjs ~/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

const arg = path.resolve(raw);

function findGitRoot(start) {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function findAppDirs(root) {
  const out = [];
  const tryDirs = [
    root,
    path.join(root, "gina-backend"),
    path.join(root, "gina-backend", "gina-backend"),
    path.join(arg),
    path.join(arg, "gina-backend"),
  ];
  const seen = new Set();
  for (const dir of tryDirs) {
    const resolved = path.resolve(dir);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    if (!fs.existsSync(resolved)) continue;
    const pkg = path.join(resolved, "package.json");
    const server = path.join(resolved, "server.js");
    if (fs.existsSync(pkg)) {
      out.push({
        dir: resolved,
        hasServer: fs.existsSync(server),
        pkg,
      });
    }
  }
  return out;
}

function ensureStart(pkgPath, serverPath) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  pkg.scripts = pkg.scripts || {};
  const before = pkg.scripts.start || null;
  if (!pkg.scripts.start) {
    pkg.scripts.start = fs.existsSync(serverPath)
      ? "node server.js"
      : pkg.main
        ? `node ${pkg.main}`
        : "node server.js";
  }
  if (!pkg.main && fs.existsSync(serverPath)) pkg.main = "server.js";
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  return { pkg, before, start: pkg.scripts.start };
}

function writeRailway(appDir, startCommand = "npm start") {
  const railwayPath = path.join(appDir, "railway.json");
  const railway = {
    $schema: "https://railway.com/railway.schema.json",
    build: { builder: "RAILPACK" },
    deploy: {
      startCommand,
      restartPolicyType: "ON_FAILURE",
    },
  };
  fs.writeFileSync(railwayPath, JSON.stringify(railway, null, 2) + "\n", "utf8");
  return railwayPath;
}

const gitRoot = findGitRoot(arg) || findGitRoot(path.dirname(arg));
const searchRoot = gitRoot || arg;
const apps = findAppDirs(searchRoot);

console.log("Arg:", arg);
console.log("Git root:", gitRoot || "(not found)");
console.log("Apps with package.json:");
if (!apps.length) {
  console.error("\nNONE found. Your Gina app is not where we expected.");
  console.error("Run and paste output:");
  console.error("  ls -la ~/lyday-gina-backend");
  console.error("  ls -la ~/lyday-gina-backend/gina-backend");
  console.error("  find ~/lyday-gina-backend -maxdepth 3 -name package.json -o -name server.js");
  process.exit(2);
}
for (const a of apps) {
  console.log(
    `  - ${a.dir}${a.hasServer ? " (has server.js)" : " (NO server.js)"}`,
  );
}

// Prefer app that has server.js closest to a typical layout
const app =
  apps.find((a) => a.hasServer && path.basename(a.dir) === "gina-backend") ||
  apps.find((a) => a.hasServer) ||
  apps[0];

console.log("\nUsing app dir:", app.dir);
const serverPath = path.join(app.dir, "server.js");
const { before, start } = ensureStart(app.pkg, serverPath);
console.log("  start was:", before || "(missing)");
console.log("  start now:", start);
writeRailway(app.dir, "npm start");
console.log("  wrote railway.json");

// If app is nested under git root, also fix ROOT so blank Root Directory works
let rootPackageWritten = false;
if (gitRoot && path.resolve(app.dir) !== path.resolve(gitRoot)) {
  const relServer = path.relative(gitRoot, serverPath).replace(/\\/g, "/");
  const relApp = path.relative(gitRoot, app.dir).replace(/\\/g, "/");
  const rootPkgPath = path.join(gitRoot, "package.json");
  let rootPkg = {
    name: "lyday-gina-backend",
    private: true,
    scripts: {},
  };
  if (fs.existsSync(rootPkgPath)) {
    try {
      rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));
      rootPkg.scripts = rootPkg.scripts || {};
    } catch {
      /* keep default */
    }
  }
  // Always set start to nested server — this is what Railpack needs at repo root
  rootPkg.scripts.start = `node ${relServer}`;
  if (!rootPkg.scripts.build) {
    rootPkg.scripts.build = `npm --prefix ${relApp} run build --if-present`;
  }
  if (!rootPkg.main) rootPkg.main = relServer;
  fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + "\n", "utf8");
  writeRailway(gitRoot, "npm start");
  rootPackageWritten = true;
  console.log("\nAlso wrote ROOT package.json + railway.json (for blank Root Directory)");
  console.log("  root start:", rootPkg.scripts.start);
}

// Show what git will see
if (gitRoot) {
  const tracked = spawnSync(
    "git",
    ["-C", gitRoot, "ls-files", "package.json", "**/package.json", "server.js", "**/server.js", "railway.json", "**/railway.json"],
    { encoding: "utf8" },
  );
  console.log("\nTracked deploy files in git:");
  console.log((tracked.stdout || "(none)").trim() || "(none — you must git add + push)");
}

const nested = gitRoot && path.resolve(app.dir) !== path.resolve(gitRoot);
const rootDirForUi = nested ? path.relative(gitRoot, app.dir).replace(/\\/g, "/") : "(leave BLANK)";

console.log(`
═══════════════════════════════════════════════════════════
DO THIS IN RAILWAY (Gina service → Settings) THEN REDEPLOY
═══════════════════════════════════════════════════════════

Option A — simplest if nested monorepo (recommended after this script):
  Root Directory     =  (LEAVE BLANK / empty)
  Start Command      =  npm start
  Connected repo     =  your Gina repo (lyday-gina-backend), NOT AI-ATS

Option B — build only the app folder:
  Root Directory     =  ${rootDirForUi}
  Start Command      =  npm start

Then: Deployments → Redeploy

═══════════════════════════════════════════════════════════
COMMIT + PUSH
═══════════════════════════════════════════════════════════
`);

if (gitRoot) {
  const relApp = path.relative(gitRoot, app.dir).replace(/\\/g, "/") || ".";
  console.log(`  cd ${gitRoot}`);
  if (rootPackageWritten) {
    console.log(`  git add package.json railway.json ${relApp}/package.json ${relApp}/railway.json`);
  } else {
    console.log(`  git add package.json railway.json`);
  }
  console.log(`  git status`);
  console.log(`  git commit -m "Railway: root + app npm start for Railpack"`);
  console.log(`  git pull origin main --rebase`);
  console.log(`  git push origin main`);
} else {
  console.log("  (no .git found — commit from your Gina repo manually)");
}

console.log(`
If it STILL fails after push + blank Root Directory + Start Command npm start,
paste these three Railway Settings values:
  1) Root Directory
  2) Custom Start Command
  3) Source repo name / branch
`);
