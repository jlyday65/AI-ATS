#!/usr/bin/env node
/**
 * Fix Railway ERR_MODULE_NOT_FOUND:
 *   Cannot find module '/app/routes/agents/command-agent.tool.js'
 *   imported from /app/routes/candidate-files.js
 *   Did you mean to import "../agents/command-agent.tool.js"?
 *
 * Routes live in routes/, so agents must be imported as ../agents/...
 *
 * ONE LINE:
 *   node gina-express/frontend/fix-routes-agent-imports.mjs ~/lyday-gina-backend/gina-backend
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.join(__dirname, "..");
const rootArg = String(process.argv[2] || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");
const root = path.resolve(rootArg);
const ginaDir = fs.existsSync(path.join(root, "routes"))
  ? root
  : fs.existsSync(path.join(root, "gina-backend", "routes"))
    ? path.join(root, "gina-backend")
    : root;

const routesDir = path.join(ginaDir, "routes");
if (!fs.existsSync(routesDir)) {
  console.error(
    "Usage (one line): node fix-routes-agent-imports.mjs ~/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

function copyKit(rel) {
  const src = path.join(pkg, rel);
  const dest = path.join(ginaDir, rel);
  if (!fs.existsSync(src)) {
    console.warn("Skip missing kit file:", rel);
    return false;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log("Restored from kit:", rel);
  return true;
}

// Prefer known-good kit copies for the usual offenders
copyKit("routes/candidate-files.js");
copyKit("routes/run-command.js");
copyKit("agents/command-agent.tool.js");
copyKit("agents/candidate-file.tool.js");
copyKit("agents/bot-replies.js");
copyKit("agents/registry.js");
copyKit("lib/candidate-files.js");

const REPLACEMENTS = [
  ['./agents/', '../agents/'],
  ["./agents/", "../agents/"],
  ["'/agents/", "'../agents/"],
  ['"/agents/', '"../agents/'],
  ["./lib/", "../lib/"],
  ['./lib/', '../lib/'],
];

function fixImports(text) {
  let next = text;
  // Dynamic + static import/export from "./agents/..."
  next = next.replace(
    /(from\s+|import\s*\(\s*)(["'])\.\/agents\//g,
    `$1$2../agents/`,
  );
  next = next.replace(
    /(from\s+|import\s*\(\s*)(["'])\.\/lib\//g,
    `$1$2../lib/`,
  );
  next = next.replace(
    /(from\s+|import\s*\(\s*)(["'])\.\/maria-source\.tool\.js/g,
    `$1$2../maria-source.tool.js`,
  );
  // Also catch require("./agents/...")
  next = next.replace(
    /(require\s*\(\s*)(["'])\.\/agents\//g,
    `$1$2../agents/`,
  );
  next = next.replace(
    /(require\s*\(\s*)(["'])\.\/lib\//g,
    `$1$2../lib/`,
  );
  return next;
}

function canParse(file, code) {
  const tmp = `${file}.parse-tmp-${Date.now()}.mjs`;
  fs.writeFileSync(tmp, code, "utf8");
  const r = spawnSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
  try {
    fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }
  return r.status === 0;
}

let fixedFiles = 0;
for (const name of fs.readdirSync(routesDir)) {
  if (!/\.(js|mjs|cjs)$/i.test(name) || name.includes(".bak")) continue;
  const file = path.join(routesDir, name);
  const src = fs.readFileSync(file, "utf8");
  const next = fixImports(src);
  if (next === src) {
    // Still report if it contains the bad pattern somehow escaped
    if (/routes\/agents|["']\.\/agents\//.test(src)) {
      console.warn("Still has suspicious agent path:", file);
    }
    continue;
  }
  if (!canParse(file, next)) {
    console.error("REFUSING:", file, "— rewrite would not parse");
    continue;
  }
  const bak = `${file}.bak-agent-import-${Date.now()}`;
  fs.copyFileSync(file, bak);
  fs.writeFileSync(file, next, "utf8");
  fixedFiles += 1;
  console.log("Fixed imports in", path.relative(ginaDir, file));
  console.log("  backup:", bak);
}

// Verify candidate-files specifically
const cf = path.join(routesDir, "candidate-files.js");
if (fs.existsSync(cf)) {
  const src = fs.readFileSync(cf, "utf8");
  if (/["']\.\/agents\//.test(src)) {
    console.error("FAILED: candidate-files.js still has ./agents/ imports");
    process.exit(2);
  }
  if (!canParse(cf, src)) {
    console.error("FAILED: candidate-files.js does not parse");
    process.exit(2);
  }
  console.log("OK: routes/candidate-files.js uses ../agents (or no agents import)");
}

console.log(`
Fixed route files: ${fixedFiles}

Next:
  cd ~/lyday-gina-backend
  node --check gina-backend/routes/candidate-files.js
  node --check gina-backend/routes/run-command.js
  git add gina-backend/routes gina-backend/agents gina-backend/lib
  git status
  git commit -m "Fix routes agent import paths (../agents not ./agents)"
  git pull origin main --rebase
  git push origin main

Railway should boot after redeploy.
`);
