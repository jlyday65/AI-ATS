#!/usr/bin/env node
/**
 * Fix SyntaxError in gina.js from broken get_pipeline_summary description
 * (unescaped "Pipeline Stage Counts" inside a "..." string).
 *
 * ONE LINE:
 *   node gina-express/frontend/fix-gina-pipeline-description.mjs ~/lyday-gina-backend/gina-backend/gina.js
 *   # or:
 *   node gina-express/frontend/fix-gina-pipeline-description.mjs ~/lyday-gina-backend/gina-backend
 */

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const raw = String(process.argv[2] || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");
let target = path.resolve(raw);
if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
  target = path.join(target, "gina.js");
  if (!fs.existsSync(target)) {
    target = path.join(path.dirname(target), "gina-backend", "gina.js");
  }
}
if (!target || !fs.existsSync(target)) {
  console.error(
    "Usage (one line): node fix-gina-pipeline-description.mjs ~/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

let src = fs.readFileSync(target, "utf8");
const bak = `${target}.bak-pipeline-desc-${Date.now()}`;
fs.copyFileSync(target, bak);

const CLEAN_DESC =
  "Return a Pipeline overview formatted like Kimberley's Notes from LIVE Board counts only (headers, • bullets, light emojis OK). Lead with Pipeline Stage Counts. If the Board is empty, every stage is 0 — NEVER invent totals (e.g. New: 64), NEVER reuse an old dated snapshot, NEVER use markdown tables or Key Takeaways. Always include Team updates as Ask + full reply blocks from /ats/kimberley-notes/briefing or /ats/pipeline-briefing. Do not suggest Michelle screen candidates when New is 0.";

/**
 * Replace description: "..." for get_pipeline_summary even when the string
 * is already syntactically broken (nested quotes / duplicated text).
 */
function fixGetPipelineSummaryDesc(text) {
  const nameRe = /name:\s*["']get_pipeline_summary["']/;
  const nameIdx = text.search(nameRe);
  if (nameIdx < 0) return { text, fixed: false, reason: "get_pipeline_summary not found" };

  const windowStart = nameIdx;
  const windowEnd = Math.min(text.length, nameIdx + 2500);
  const slice = text.slice(windowStart, windowEnd);
  const descKey = slice.search(/description:\s*/);
  if (descKey < 0) {
    return { text, fixed: false, reason: "description not near get_pipeline_summary" };
  }

  const absDesc = windowStart + descKey;
  const afterKey = text.slice(absDesc);
  const m = afterKey.match(/^description:\s*(["'`])/);
  if (!m) {
    return { text, fixed: false, reason: "could not find description quote" };
  }
  const quote = m[1];
  const valueStart = absDesc + m[0].length;

  // Scan forward for end of broken/good string, then optional comma
  // Prefer stopping at: ",\n    nextKey:  or  ',\n    nextKey:
  let valueEnd = -1;
  if (quote === "`") {
    valueEnd = text.indexOf("`", valueStart);
  } else {
    // Broken double-quoted strings: find a line that looks like property end
    // Match until we see  ",\n  <ident>:  or  ',\n  <ident>:
    const tail = text.slice(valueStart);
    const endMatch = tail.match(
      /["']\s*,\s*\n\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*:/,
    );
    if (endMatch) {
      valueEnd = valueStart + endMatch.index; // points at closing quote
    } else {
      // Fallback: first ",\n
      const alt = tail.search(/["']\s*,/);
      if (alt >= 0) valueEnd = valueStart + alt;
    }
  }

  if (valueEnd < 0) {
    return { text, fixed: false, reason: "could not find end of description string" };
  }

  // Use single-quoted description to avoid nested " issues
  const replacement = `description: '${CLEAN_DESC.replace(/'/g, "\\'")}'`;
  // Include from "description:" through the closing quote only
  const closeQuoteLen = 1;
  const before = text.slice(0, absDesc);
  const after = text.slice(valueEnd + closeQuoteLen);
  // after should start with optional whitespace/comma — keep as-is
  const out = before + replacement + after;
  return { text: out, fixed: true };
}

// Also heal any remaining raw broken pattern globally (duplicate paste)
let out = src;
out = out.replace(
  /description:\s*"Return a clean plain-text pipeline briefing[\s\S]*?Always include[\s\S]*?pipeline-briefing\."Pipeline Stage Counts"[\s\S]*?(?=["']\s*,)/,
  () => `description: '${CLEAN_DESC.replace(/'/g, "\\'")}`,
);

const result = fixGetPipelineSummaryDesc(out);
if (result.fixed) {
  out = result.text;
  console.log("Fixed get_pipeline_summary description");
} else {
  console.log("Primary fixer:", result.reason);
  // Last-resort: replace the exact broken fragment from Railway logs
  if (/Lead with "Pipeline Stage Counts"/.test(out)) {
    out = out.replace(
      /description:\s*"Return a clean plain-text pipeline briefing\.[\s\S]*?Returns null\/empty if none has ever been sent\."/,
      `description: '${CLEAN_DESC.replace(/'/g, "\\'")}'`,
    );
    console.log("Applied last-resort broken-string replace");
  }
}

// If we accidentally removed the "Send today's pipeline summary" tool text,
// that's OK — that belonged to a different tool mashed into this description.

fs.writeFileSync(target, out, "utf8");

const check = spawnSync(process.execPath, ["--check", target], {
  encoding: "utf8",
});
if (check.status !== 0) {
  console.error("REFUSING: gina.js still fails node --check");
  console.error(check.stderr || check.stdout);
  fs.copyFileSync(bak, target);
  console.error("Restored backup:", bak);
  process.exit(2);
}

console.log("OK: gina.js passes node --check");
console.log("Backup:", bak);
console.log("Wrote:", target);
console.log(`
Next:
  cd ~/lyday-gina-backend
  git add gina-backend/gina.js
  git status
  git commit -m "Fix gina.js SyntaxError in get_pipeline_summary description"
  git push origin main

Railway Redeploy — confirm server starts.
`);
