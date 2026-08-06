#!/usr/bin/env node
/**
 * Fix Railway/chat HTTP 500: {"error":"pool is not defined"}
 *
 * Root cause: a module calls pool.query (queue Ashton/Maria actions, notes, etc.)
 * without a TOP-LEVEL import of pool. Earlier versions of this script falsely
 * treated `function foo({ pool })` as a binding and skipped the fix.
 *
 * ONE LINE (fix everything):
 *   node gina-express/frontend/fix-gina-pool-undefined.mjs ~/lyday-gina-backend/gina-backend
 *
 * Diagnose only (no writes):
 *   node gina-express/frontend/fix-gina-pool-undefined.mjs ~/lyday-gina-backend/gina-backend --diagnose
 *
 * Force re-inject even if a stale import line exists:
 *   node gina-express/frontend/fix-gina-pool-undefined.mjs ~/lyday-gina-backend/gina-backend --force
 */

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2).filter(Boolean);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const diagnoseOnly = flags.has("--diagnose") || flags.has("-n");
const force = flags.has("--force");
const pos = args.filter((a) => !a.startsWith("--"));

const raw = String(pos[0] || "")
  .trim()
  .replace(/^~(?=$|\/|\\)/, process.env.HOME || "");
const root = path.resolve(raw);
const ginaDir = fs.existsSync(path.join(root, "gina.js"))
  ? root
  : fs.existsSync(path.join(root, "gina-backend", "gina.js"))
    ? path.join(root, "gina-backend")
    : root;

const ginaPath = path.join(ginaDir, "gina.js");
if (!raw || !fs.existsSync(ginaPath)) {
  console.error(
    "Usage (one line):\n" +
      "  node fix-gina-pool-undefined.mjs ~/lyday-gina-backend/gina-backend\n" +
      "  node fix-gina-pool-undefined.mjs ~/lyday-gina-backend/gina-backend --diagnose\n" +
      "  node fix-gina-pool-undefined.mjs ~/lyday-gina-backend/gina-backend --force",
  );
  process.exit(1);
}

const SKIP_DIR = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  "frontend", // Vite UI — pool lives on the Express side
]);

function canParse(file, code) {
  const tmp = `${file}.parse-tmp-${Date.now()}.mjs`;
  fs.writeFileSync(tmp, code, "utf8");
  const r = spawnSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
  try {
    fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }
  return { ok: r.status === 0, err: (r.stderr || r.stdout || "").trim() };
}

/**
 * True if the file has a real pool binding.
 * - Import / require of pool
 * - `const pool = …` (top-level or local like deps.pool)
 * Does NOT treat function params like `function foo({ pool })` as enough —
 * that false-positive left chat 500ing after the first fix.
 */
function hasPoolBinding(src) {
  if (
    /^import\s*\{[^}\n]*\bpool\b[^}\n]*\}\s*from\s*["'][^"']+["']\s*;?\s*$/m.test(
      src,
    )
  ) {
    return true;
  }
  if (/^import\s+pool\s+from\s*["'][^"']+["']\s*;?\s*$/m.test(src)) {
    return true;
  }
  if (
    /(?:const|let|var)\s*\{[^}\n]*\bpool\b[^}\n]*\}\s*=\s*require\s*\(\s*["'][^"']+["']\s*\)/.test(
      src,
    )
  ) {
    return true;
  }
  if (
    /(?:const|let|var)\s+pool\s*=\s*require\s*\(\s*["'][^"']+["']\s*\)/.test(
      src,
    )
  ) {
    return true;
  }
  // Real assignment (not a function parameter)
  if (/\b(?:export\s+)?(?:const|let|var)\s+pool\s*=/.test(src)) {
    return true;
  }
  return false;
}

function usesPoolStrict(src) {
  // Strip comments so commented queue snippets don't trigger false positives
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  return (
    /\bpool\.(query|connect|end|on|totalCount)\b/.test(stripped) ||
    /\bawait\s+pool\b/.test(stripped)
  );
}

function walkJsFiles(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    if (ent.name.startsWith(".") && ent.name !== ".env") continue;
    if (SKIP_DIR.has(ent.name)) continue;
    if (/\.bak/i.test(ent.name) || /\.parse-tmp-/i.test(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walkJsFiles(full, out);
      continue;
    }
    if (!/\.(js|mjs|cjs)$/i.test(ent.name)) continue;
    out.push(full);
  }
  return out;
}

function detectDbImportStyle(ginaDir) {
  const candidates = [
    path.join(ginaDir, "db.js"),
    path.join(ginaDir, "lib", "db.js"),
    path.join(ginaDir, "database.js"),
    path.join(ginaDir, "lib", "database.js"),
    path.join(ginaDir, "pg.js"),
  ];
  for (const dbPath of candidates) {
    if (!fs.existsSync(dbPath)) continue;
    const db = fs.readFileSync(dbPath, "utf8");
    const rel = "./" + path.relative(ginaDir, dbPath).split(path.sep).join("/");
    const named =
      /export\s*\{[^}]*\bpool\b/.test(db) ||
      /\bexport\s+const\s+pool\b/.test(db) ||
      /\bexports\.pool\s*=/.test(db) ||
      /module\.exports\s*=\s*\{[^}]*\bpool\b/.test(db);
    const def =
      /export\s+default\s+pool\b/.test(db) ||
      /module\.exports\s*=\s*pool\b/.test(db);
    if (named) return { rel, named: true, dbPath };
    if (def) return { rel, named: false, dbPath };
    // File exists but unclear — prefer named import (kit convention)
    return { rel, named: true, dbPath, unclear: true };
  }
  return null;
}

function ensureDbJs(ginaDir) {
  const dbPath = path.join(ginaDir, "db.js");
  if (fs.existsSync(dbPath)) return { created: false, path: dbPath };
  const body = `import pg from "pg";

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.PGDATABASE_URL ||
  "";

if (!connectionString) {
  console.warn(
    "[db.js] DATABASE_URL is not set — pool queries will fail at runtime",
  );
}

export const pool = new Pool(
  connectionString
    ? { connectionString, ssl: process.env.PGSSL === "false" ? false : { rejectUnauthorized: false } }
    : undefined,
);

export default pool;
`;
  if (diagnoseOnly) {
    console.log("Would CREATE missing db.js at", dbPath);
    return { created: false, path: dbPath, missing: true };
  }
  fs.writeFileSync(dbPath, body, "utf8");
  console.log("Created missing db.js:", dbPath);
  return { created: true, path: dbPath };
}

function relImportFrom(file, styleRel) {
  const absDb = path.resolve(ginaDir, styleRel);
  let rel = path.relative(path.dirname(file), absDb).split(path.sep).join("/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}

function ensurePoolImport(src, style, file) {
  if (!usesPoolStrict(src)) {
    return { src, changed: false, reason: "no pool usage" };
  }
  const already = hasPoolBinding(src);
  if (already && !force) {
    return { src, changed: false, reason: "already has pool binding" };
  }
  if (!style) {
    return { src, changed: false, reason: "db.js missing — cannot auto-import" };
  }

  const rel = relImportFrom(file, style.rel);
  const importLine = style.named
    ? `import { pool } from "${rel}";`
    : `import pool from "${rel}";`;

  let next = src;
  // Drop broken / duplicate pool imports so --force is clean
  next = next.replace(
    /^import\s*(?:\{[^}]*\bpool\b[^}]*\}|pool)\s*from\s*["'][^"']+["']\s*;?\s*\n?/gm,
    "",
  );
  next = next.replace(
    /^(?:const|let|var)\s*(?:\{[^}]*\bpool\b[^}]*\}|pool)\s*=\s*require\s*\(\s*["'][^"']+["']\s*\)\s*;?\s*\n?/gm,
    "",
  );

  if (/^import\s+/m.test(next)) {
    const matches = [...next.matchAll(/^import .+$/gm)];
    const last = matches[matches.length - 1];
    const idx = last.index + last[0].length;
    next = next.slice(0, idx) + "\n" + importLine + "\n" + next.slice(idx);
  } else {
    next = importLine + "\n" + next;
  }
  return {
    src: next,
    changed: next !== src,
    reason: already ? `re-injected ${importLine}` : `added ${importLine}`,
  };
}

function listPoolCallSites(src) {
  const lines = src.split(/\n/);
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (/\bpool\.(query|connect|end|on)\b/.test(lines[i])) {
      hits.push({ line: i + 1, text: lines[i].trim().slice(0, 120) });
    }
  }
  return hits;
}

// --- main ---
console.log("Gina dir:", ginaDir);
console.log("Mode:", diagnoseOnly ? "diagnose" : force ? "force-fix" : "fix");

let style = detectDbImportStyle(ginaDir);
if (!style) {
  const created = ensureDbJs(ginaDir);
  if (created.missing && diagnoseOnly) {
    console.error("DIAGNOSE: db.js is MISSING — that alone explains pool failures after restore.");
  }
  style = detectDbImportStyle(ginaDir);
}
console.log(
  "db.js style:",
  style
    ? `${style.named ? "named" : "default"} from ${style.rel}${style.unclear ? " (export shape unclear)" : ""}`
    : "NOT FOUND",
);

const allFiles = walkJsFiles(ginaDir);
const priority = [
  ginaPath,
  path.join(ginaDir, "server.js"),
  path.join(ginaDir, "index.js"),
  path.join(ginaDir, "app.js"),
];
const ordered = [
  ...priority.filter((p) => fs.existsSync(p)),
  ...allFiles.filter((p) => !priority.includes(p)),
];

console.log(`Scanning ${ordered.length} JS files…\n`);

let fixed = 0;
let broken = 0;
const report = [];

for (const file of ordered) {
  let src;
  try {
    src = fs.readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (!usesPoolStrict(src)) continue;

  const rel = path.relative(ginaDir, file);
  const bound = hasPoolBinding(src);
  const sites = listPoolCallSites(src);
  const status = bound ? "BOUND" : "MISSING IMPORT";
  report.push({ rel, bound, sites: sites.length });

  console.log(`${status}: ${rel} (${sites.length} pool.* call site(s))`);
  for (const s of sites.slice(0, 5)) {
    console.log(`    L${s.line}: ${s.text}`);
  }
  if (sites.length > 5) console.log(`    … +${sites.length - 5} more`);

  if (bound && !force) {
    console.log("  OK: pool binding present\n");
    continue;
  }

  const imp = ensurePoolImport(src, style, file);
  if (!imp.changed) {
    console.log("  SKIP:", imp.reason, "\n");
    if (!bound) broken += 1;
    continue;
  }

  const check = canParse(file, imp.src);
  if (!check.ok) {
    console.error("  REFUSING: fix would not parse");
    console.error("   ", check.err.split("\n")[0]);
    broken += 1;
    console.log("");
    continue;
  }

  if (diagnoseOnly) {
    console.log("  WOULD FIX:", imp.reason, "\n");
    broken += 1;
    continue;
  }

  const bak = `${file}.bak-pool-${Date.now()}`;
  fs.copyFileSync(file, bak);
  fs.writeFileSync(file, imp.src, "utf8");
  fixed += 1;
  console.log("  Fixed:", imp.reason);
  console.log("  Backup:", bak, "\n");
}

// Final verify on gina.js
const gina = fs.readFileSync(ginaPath, "utf8");
const ginaNeeds =
  usesPoolStrict(gina) && !hasPoolBinding(gina) ? true : false;
const ginaParse = canParse(ginaPath, gina);

console.log("──────── summary ────────");
console.log(`files with pool usage: ${report.length}`);
console.log(
  `missing pool binding: ${report.filter((r) => !r.bound).length}`,
);
console.log(`fixed this run: ${fixed}`);
if (diagnoseOnly) {
  console.log("(diagnose only — no files written)");
}

if (ginaNeeds) {
  console.error("\nFAILED: gina.js still uses pool without a binding");
  process.exit(2);
}
if (!ginaParse.ok) {
  console.error("\nFAILED: gina.js does not parse:", ginaParse.err.split("\n")[0]);
  process.exit(2);
}
if (!diagnoseOnly && broken > 0 && fixed === 0) {
  console.error(
    `\nFAILED: ${broken} file(s) still need a pool import and could not be fixed automatically.`,
  );
  process.exit(2);
}

if (!diagnoseOnly) {
  console.log(`
OK: pool binding present where needed (fixed ${fixed} file(s)).

VERIFY the script printed "Fixed:" for at least one file, or every usage is BOUND.
If chat still 500s after Railway redeploy, re-run with --force and paste the diagnose output.

Next (one line each):
  node --check ${ginaPath}
  cd ~/lyday-gina-backend
  git add -u gina-backend
  git status
  git commit -m "Fix pool is not defined — recursive top-level import"
  git pull origin main --rebase
  git push origin main

Then wait for Railway redeploy and retest Ashton update in Gina chat.
`);
} else if (report.some((r) => !r.bound)) {
  console.log(`
Re-run without --diagnose to apply imports:
  node ${path.relative(process.cwd(), path.join(__dirname, "fix-gina-pool-undefined.mjs")) || "fix-gina-pool-undefined.mjs"} ${raw} --force
`);
  process.exit(3);
}
