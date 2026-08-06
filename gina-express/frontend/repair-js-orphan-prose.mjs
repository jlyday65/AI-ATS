#!/usr/bin/env node
/**
 * Repair SyntaxError from orphan Gina prompt prose pasted into .js files.
 *
 * Railway error example:
 *   file:///app/routes/webhooks.js:159
 *   SyntaxError: Unexpected identifier 'TEAM'
 *   (TEAM BOT UPDATE RULE / GINA TEAM COMMAND RULE outside a string)
 *
 * ONE LINE (file):
 *   node gina-express/frontend/repair-js-orphan-prose.mjs ~/lyday-gina-backend/gina-backend/routes/webhooks.js
 *
 * ONE LINE (scan whole Gina backend):
 *   node gina-express/frontend/repair-js-orphan-prose.mjs ~/lyday-gina-backend/gina-backend
 */

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const raw = String(process.argv[2] || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");
const root = path.resolve(raw);
if (!root || !fs.existsSync(root)) {
  console.error(
    "Usage (one line): node repair-js-orphan-prose.mjs ~/lyday-gina-backend/gina-backend/routes/webhooks.js",
  );
  process.exit(1);
}

const MARKERS = [
  "TEAM BOT UPDATE RULE",
  "GINA TEAM COMMAND RULE",
  "GINA TEAM COMMAND RULE — REQUIRED",
  "KELLEY / KELLY UPDATE RULE",
  "SOURCE_CANDIDATES RULE",
  "CRITICAL TOOL RULE",
  "DUAL-FILE RULE",
  "PIPELINE BRIEFING — TEAM UPDATES RULE",
  "PIPELINE BRIEFING FORMAT RULE",
  "CANDIDATE FILE (required when Kimberley asks)",
];

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

function findOrphanCut(src) {
  let cut = -1;
  for (const m of MARKERS) {
    const re = new RegExp(
      `(^|\\n)\\s*${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    );
    const match = re.exec(src);
    if (!match) continue;
    const idx = match.index + (match[1] ? match[1].length : 0);
    // Only treat as orphan if not clearly inside a template/string on that line
    const lineStart = src.lastIndexOf("\n", idx) + 1;
    const line = src.slice(lineStart, src.indexOf("\n", idx));
    const inStringish =
      /['"`]/.test(line.slice(0, idx - lineStart)) &&
      !/^\s*(TEAM BOT|GINA TEAM|KELLEY|SOURCE_CANDIDATES|CRITICAL TOOL|DUAL-FILE|PIPELINE BRIEFING|CANDIDATE FILE)/.test(
        line,
      );
    if (inStringish) continue;
    if (cut < 0 || idx < cut) cut = idx;
  }
  // Fallback: last-half bare TEAM BOT / GINA TEAM
  if (cut < 0) {
    for (const m of MARKERS) {
      const idx = src.lastIndexOf(m);
      if (idx >= 0 && idx / src.length > 0.3 && (cut < 0 || idx < cut)) cut = idx;
    }
  }
  return cut;
}

function stripFile(file) {
  let src = fs.readFileSync(file, "utf8");
  const before = canParse(file, src);
  if (before.ok && !MARKERS.some((m) => new RegExp(`(^|\\n)\\s*${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(src))) {
    return { file, status: "ok", changed: false };
  }

  const cut = findOrphanCut(src);
  if (cut < 0) {
    return {
      file,
      status: before.ok ? "ok" : "broken_no_marker",
      changed: false,
      error: before.err,
    };
  }

  let start = cut;
  while (start > 0 && /\s/.test(src[start - 1])) start -= 1;
  // Prefer cutting from the orphan block to EOF when near the end,
  // but if JS resumes after the prose block, only drop the prose lines.
  const after = src.slice(cut);
  const resume = after.search(
    /\n(?:import |export |const |let |var |function |async function |class |module\.exports|exports\.|app\.|router\.|\/\/ ---)/,
  );
  let next;
  if (resume > 0 && resume < after.length - 20) {
    next = (src.slice(0, start) + after.slice(resume)).replace(/\n{3,}/g, "\n\n");
  } else {
    next = src.slice(0, start).replace(/\s+$/, "") + "\n";
  }

  const afterCheck = canParse(file, next);
  if (!afterCheck.ok) {
    // Last resort: cut from marker to EOF
    next = src.slice(0, start).replace(/\s+$/, "") + "\n";
    const retry = canParse(file, next);
    if (!retry.ok) {
      return {
        file,
        status: "refuse",
        changed: false,
        error: retry.err || afterCheck.err,
      };
    }
  }

  const bak = `${file}.bak-orphan-prose-${Date.now()}`;
  fs.copyFileSync(file, bak);
  fs.writeFileSync(file, next, "utf8");
  return { file, status: "fixed", changed: true, bak, size: next.length };
}

function walkJs(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (["node_modules", ".git", "dist", ".next", "frontend"].includes(name)) continue;
    const p = path.join(dir, name);
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkJs(p, out);
    else if (/\.(js|mjs|cjs)$/i.test(name) && !name.includes(".bak")) out.push(p);
  }
  return out;
}

const targets = [];
if (fs.statSync(root).isFile()) {
  targets.push(root);
} else {
  const ginaDir = fs.existsSync(path.join(root, "routes", "webhooks.js"))
    ? root
    : fs.existsSync(path.join(root, "gina-backend", "routes", "webhooks.js"))
      ? path.join(root, "gina-backend")
      : root;
  const webhooks = path.join(ginaDir, "routes", "webhooks.js");
  if (fs.existsSync(webhooks)) targets.push(webhooks);
  const ginaJs = path.join(ginaDir, "gina.js");
  if (fs.existsSync(ginaJs)) targets.push(ginaJs);
  // Also scan any currently-broken JS under routes/
  for (const f of walkJs(path.join(ginaDir, "routes"))) {
    if (!targets.includes(f) && !canParse(f, fs.readFileSync(f, "utf8")).ok) {
      targets.push(f);
    }
  }
}

if (!targets.length) {
  console.error("No webhooks.js / broken JS targets found under", root);
  process.exit(1);
}

let fixed = 0;
let failed = 0;
for (const file of targets) {
  const result = stripFile(file);
  console.log(`\n${path.basename(file)}: ${result.status}`);
  console.log("  ", file);
  if (result.bak) console.log("  backup:", result.bak);
  if (result.error) console.log("  error:", result.error.split("\n").slice(0, 4).join(" | "));
  if (result.status === "fixed") fixed += 1;
  if (result.status === "refuse" || result.status === "broken_no_marker") failed += 1;
}

console.log(`
Done. Fixed: ${fixed}. Still broken: ${failed}.

Next:
  cd ~/lyday-gina-backend
  node --check gina-backend/routes/webhooks.js
  node --check gina-backend/gina.js
  git add gina-backend/routes/webhooks.js gina-backend/gina.js
  git status
  git commit -m "Strip orphan TEAM prompt prose from webhooks.js"
  git pull origin main --rebase
  git push origin main

Railway should boot again after redeploy.
`);

process.exit(failed ? 2 : 0);
