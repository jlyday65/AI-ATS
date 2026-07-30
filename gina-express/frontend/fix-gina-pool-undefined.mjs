#!/usr/bin/env node
/**
 * Fix Railway/chat HTTP 500: {"error":"pool is not defined"}
 *
 * Usually gina.js (or calendar/agentActivity) calls pool.query to queue
 * ats_actions after nuclear restore dropped `import { pool } from "./db.js"`.
 *
 * ONE LINE:
 *   node gina-express/frontend/fix-gina-pool-undefined.mjs ~/lyday-gina-backend/gina-backend
 */

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const raw = String(process.argv[2] || "")
  .trim()
  .replace(/^~(?=$|\/|\\)/, process.env.HOME || "");
const root = path.resolve(raw);
const ginaDir = fs.existsSync(path.join(root, "gina.js"))
  ? root
  : fs.existsSync(path.join(root, "gina-backend", "gina.js"))
    ? path.join(root, "gina-backend")
    : root;

const ginaPath = path.join(ginaDir, "gina.js");
if (!fs.existsSync(ginaPath)) {
  console.error(
    "Usage (one line): node fix-gina-pool-undefined.mjs ~/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
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

function hasPoolBinding(src) {
  return (
    /import\s*\{[^}]*\bpool\b[^}]*\}\s*from\s*["'][^"']+db\.js["']/.test(src) ||
    /import\s+pool\s+from\s*["'][^"']+db\.js["']/.test(src) ||
    /const\s+pool\s*=/.test(src) ||
    /let\s+pool\s*=/.test(src) ||
    /var\s+pool\s*=/.test(src) ||
    /function\s+[^(]*\([^)]*\bpool\b/.test(src)
  );
}

function usesPool(src) {
  return /\bpool\.(query|connect|end|on)\b/.test(src) || /\bawait\s+pool\b/.test(src);
}

function detectDbImportStyle(ginaDir) {
  const dbPath = path.join(ginaDir, "db.js");
  if (!fs.existsSync(dbPath)) {
    // try lib/db.js
    const libDb = path.join(ginaDir, "lib", "db.js");
    if (fs.existsSync(libDb)) return { rel: "./lib/db.js", named: true };
    return null;
  }
  const db = fs.readFileSync(dbPath, "utf8");
  const named = /export\s*\{[^}]*\bpool\b|\bexport\s+const\s+pool\b|\bexport\s+\{?\s*pool/.test(
    db,
  );
  const def =
    /export\s+default\s+pool\b|export\s+default\s+\{[^}]*pool/.test(db) ||
    /module\.exports\s*=\s*pool/.test(db);
  // Prefer named if present; many Gina apps use `export const pool` or `export { pool }`
  if (named || /export\s+const\s+pool|exports\.pool/.test(db)) {
    return { rel: "./db.js", named: true };
  }
  if (def) return { rel: "./db.js", named: false };
  // Default guess used across kit
  return { rel: "./db.js", named: true };
}

function ensurePoolImport(src, style, fromFile) {
  if (!usesPool(src)) return { src, changed: false, reason: "no pool usage" };
  if (hasPoolBinding(src)) return { src, changed: false, reason: "already bound" };
  if (!style) {
    return { src, changed: false, reason: "db.js missing — cannot auto-import" };
  }

  // Relative path from file to db
  let rel = style.rel;
  if (fromFile.includes(`${path.sep}lib${path.sep}`) && rel === "./db.js") {
    rel = "../db.js";
  } else if (fromFile.includes(`${path.sep}routes${path.sep}`) && rel === "./db.js") {
    rel = "../db.js";
  } else if (fromFile.includes(`${path.sep}lib${path.sep}`) && rel === "./lib/db.js") {
    rel = "./db.js";
  }

  const importLine = style.named
    ? `import { pool } from "${rel}";\n`
    : `import pool from "${rel}";\n`;

  let next = src;
  if (/^import\s+/m.test(next)) {
    // insert after last import
    const matches = [...next.matchAll(/^import .+$/gm)];
    const last = matches[matches.length - 1];
    const idx = last.index + last[0].length;
    next = next.slice(0, idx) + "\n" + importLine + next.slice(idx);
  } else {
    next = importLine + next;
  }
  return { src: next, changed: true, reason: `added ${importLine.trim()}` };
}

/**
 * Soft-guard: wrap bare pool.query in a helper if import still impossible.
 */
function addPoolGuardFallback(src) {
  if (hasPoolBinding(src) || !usesPool(src)) return { src, changed: false };
  if (/function\s+requirePool\b|const\s+requirePool\b/.test(src)) {
    return { src, changed: false };
  }
  const guard = `
function requirePool() {
  if (typeof pool === "undefined" || !pool) {
    throw new Error(
      "Database pool is not configured. Ensure db.js exports pool and gina.js imports it: import { pool } from \\"./db.js\\"",
    );
  }
  return pool;
}
`.trim();

  let next = src;
  // Don't rewrite inside strings aggressively — only replace pool.query( with requirePool().query(
  next = next.replace(/\bpool\.query\s*\(/g, "requirePool().query(");
  if (next === src) return { src, changed: false };
  if (/^import\s+/m.test(next)) {
    const last = [...next.matchAll(/^import .+$/gm)].pop();
    const idx = last.index + last[0].length;
    next = next.slice(0, idx) + "\n\n" + guard + "\n" + next.slice(idx);
  } else {
    next = guard + "\n\n" + next;
  }
  return { src: next, changed: true };
}

const style = detectDbImportStyle(ginaDir);
console.log("Gina dir:", ginaDir);
console.log(
  "db.js style:",
  style ? `${style.named ? "named" : "default"} from ${style.rel}` : "NOT FOUND",
);

const targets = [
  ginaPath,
  path.join(ginaDir, "server.js"),
  path.join(ginaDir, "lib", "calendar.js"),
  path.join(ginaDir, "lib", "agentActivity.js"),
  path.join(ginaDir, "calendar.js"),
].filter((p) => fs.existsSync(p));

let fixed = 0;
for (const file of targets) {
  const src = fs.readFileSync(file, "utf8");
  if (!usesPool(src)) {
    console.log("Skip (no pool use):", path.relative(ginaDir, file));
    continue;
  }
  console.log("\nChecking", path.relative(ginaDir, file));
  console.log("  uses pool:", true, "| has binding:", hasPoolBinding(src));

  let next = src;
  let note = "";
  const imp = ensurePoolImport(next, style, file);
  if (imp.changed) {
    next = imp.src;
    note = imp.reason;
  } else if (imp.reason === "db.js missing — cannot auto-import") {
    const guard = addPoolGuardFallback(next);
    if (guard.changed) {
      next = guard.src;
      note = "added requirePool() guard (db.js missing)";
    } else {
      console.warn("  WARNING: pool used but db.js not found and guard not applied");
      continue;
    }
  } else {
    console.log("  OK:", imp.reason);
    continue;
  }

  if (!canParse(file, next)) {
    console.error("  REFUSING: fix would not parse");
    continue;
  }
  const bak = `${file}.bak-pool-${Date.now()}`;
  fs.copyFileSync(file, bak);
  fs.writeFileSync(file, next, "utf8");
  fixed += 1;
  console.log("  Fixed:", note);
  console.log("  Backup:", bak);
}

// Verify gina.js
const gina = fs.readFileSync(ginaPath, "utf8");
if (usesPool(gina) && !hasPoolBinding(gina)) {
  console.error("\nFAILED: gina.js still uses pool without a binding");
  process.exit(2);
}
if (!canParse(ginaPath, gina)) {
  console.error("\nFAILED: gina.js does not parse after fix");
  process.exit(2);
}

console.log(`
OK: fixed ${fixed} file(s). pool binding present where needed.

Retest chat:
  "Gina please get an update from Ashton on his projects"

Next:
  cd ~/lyday-gina-backend
  node --check gina-backend/gina.js
  git add gina-backend/gina.js gina-backend/server.js gina-backend/lib
  git status
  git commit -m "Fix pool is not defined in Gina chat/queue path"
  git pull origin main --rebase
  git push origin main
`);
