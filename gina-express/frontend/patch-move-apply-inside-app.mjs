#!/usr/bin/env node
/**
 * Fix: Skipped import_candidate — Can't find variable: candidates
 *
 * applyAgentAction must live INSIDE the App component (same closure as
 * candidates / jobs / addCandidate). Our earlier patches sometimes left it
 * at module scope.
 *
 * Usage:
 *   curl -fsSL "https://raw.githubusercontent.com/jlyday65/AI-ATS/cursor/ai-ats-b2b-platform-4f1f/gina-express/frontend/patch-move-apply-inside-app.mjs" -o /tmp/patch-move-apply-inside-app.mjs
 *   node /tmp/patch-move-apply-inside-app.mjs /Users/jameslyday/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 */

import fs from "fs";
import path from "path";

const target = path.resolve(
  String(process.argv[2] || "").replace(/^~/, process.env.HOME || ""),
);
if (!target || !fs.existsSync(target)) {
  console.error(
    "Usage: node /tmp/patch-move-apply-inside-app.mjs /Users/.../frontend/src/App.jsx",
  );
  process.exit(1);
}

let src = fs.readFileSync(target, "utf8");
const bak = `${target}.bak-scope-${Date.now()}`;
fs.copyFileSync(target, bak);

function extractFunctionBlock(text, startIdx) {
  // startIdx points at "async function applyAgentAction" or "function applyAgentAction"
  const brace = text.indexOf("{", startIdx);
  if (brace < 0) return null;
  let depth = 0;
  for (let i = brace; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return { start: startIdx, end: i + 1, body: text.slice(startIdx, i + 1) };
    }
  }
  return null;
}

// Also pull preceding BOT_NAMES + isBotMatch helpers if immediately above
function expandStart(text, fnStart) {
  let start = fnStart;
  const before = text.slice(0, fnStart);
  const bot = before.lastIndexOf("const BOT_NAMES");
  if (bot >= 0 && fnStart - bot < 800) {
    // ensure nothing other than helpers/whitespace between bot and fn
    const between = before.slice(bot);
    if (/const BOT_NAMES[\s\S]*function isBotMatch[\s\S]*$/.test(between) ||
        /const BOT_NAMES[\s\S]*$/.test(between)) {
      start = bot;
    }
  }
  return start;
}

const appMatch = src.match(
  /(?:export\s+default\s+)?function\s+App\s*\(|(?:export\s+default\s+)?function\s+App\b|const\s+App\s*=\s*(?:async\s*)?\(/,
);
if (!appMatch) {
  console.error("Could not find App component");
  process.exit(1);
}

const appStart = appMatch.index;
// Find App function body start
const appBrace = src.indexOf("{", appStart);
if (appBrace < 0) {
  console.error("Could not find App body");
  process.exit(1);
}

// Find matching end of App — approximate by depth from appBrace, but App is huge.
// Better: find applyAgentAction occurrences and classify inside/outside App by
// checking if they're between appStart and a heuristic App end.

const fnRe = /(?:async\s+)?function\s+applyAgentAction\b/g;
const fns = [];
let m;
while ((m = fnRe.exec(src))) {
  const block = extractFunctionBlock(src, m.index);
  if (!block) continue;
  const start = expandStart(src, block.start);
  fns.push({ ...block, start, full: src.slice(start, block.end) });
}

if (!fns.length) {
  console.error("No applyAgentAction found");
  process.exit(1);
}

// Determine App end: search for \nfunction JobsView or similar after appStart,
// OR use brace matching with a cap — App usually ends before helper function JobsView.
const afterApp = src.slice(appBrace);
const helperAt = afterApp.search(
  /\n(?:function JobsView|function ResumeTabPanel|function ResumeUploadPanel|function Board|function Kanban)\b/,
);
let appEnd;
if (helperAt >= 0) {
  appEnd = appBrace + helperAt;
} else {
  // brace match whole App
  let depth = 0;
  appEnd = -1;
  for (let i = appBrace; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) {
        appEnd = i;
        break;
      }
    }
  }
  if (appEnd < 0) {
    console.error("Could not determine App end");
    process.exit(1);
  }
}

const inside = fns.filter((f) => f.start > appBrace && f.start < appEnd);
const outside = fns.filter((f) => f.start < appBrace || f.start >= appEnd);

console.log("App range:", appBrace, "→", appEnd);
console.log("applyAgentAction inside App:", inside.length);
console.log("applyAgentAction outside App:", outside.length);

// Prefer the richest/fullest function body (has source_candidates + import_candidate)
function score(fn) {
  let s = 0;
  if (/source_candidates_signalhire/.test(fn.full)) s += 5;
  if (/import_candidate/.test(fn.full)) s += 5;
  if (/taskHint/.test(fn.full)) s += 3;
  if (/addCandidate/.test(fn.full)) s += 2;
  if (/BOT_NAMES/.test(fn.full)) s += 1;
  return s + fn.full.length / 10000;
}

const best = [...fns].sort((a, b) => score(b) - score(a))[0];
console.log("Using best applyAgentAction score", score(best), "len", best.full.length);

// Remove ALL existing applyAgentAction (+ helpers) blocks, from end to start
const sorted = [...fns].sort((a, b) => b.start - a.start);
let next = src;
for (const f of sorted) {
  const start = expandStart(next, next.indexOf(f.full) >= 0 ? next.indexOf(f.full) : f.start);
  // re-find by content
  const idx = next.indexOf(f.full);
  if (idx >= 0) {
    const s2 = expandStart(next, idx);
    next = next.slice(0, s2) + next.slice(idx + f.full.length);
  }
}

// Recompute App insert point: just before App's return (
const appFn = next.match(
  /(?:export\s+default\s+)?function\s+App\b[^{]*\{/,
);
if (!appFn) {
  console.error("Lost App after removal");
  process.exit(1);
}
const insertFrom = appFn.index + appFn[0].length;
// Find `return (` that is the main render — last return before JobsView helper
const jobsIdx = next.search(/\nfunction JobsView\b/);
const appSectionEnd = jobsIdx > 0 ? jobsIdx : next.length;
const section = next.slice(0, appSectionEnd);
const returnIdx = section.lastIndexOf("\n  return (");
const altReturn = section.lastIndexOf("\n  return(");
const ret = Math.max(returnIdx, altReturn);
if (ret < insertFrom) {
  console.error("Could not find App return ( for insertion");
  process.exit(1);
}

// Ensure best.full references addCandidate/candidates — keep as-is
const injection = `\n\n  ${best.full.trim()}\n\n`;
next = next.slice(0, ret) + injection + next.slice(ret);

// Ensure await on call sites inside App
next = next.replace(/async\s+function\s+await\s+applyAgentAction/g, "async function applyAgentAction");
if (!/await\s+applyAgentAction\s*\(\s*action\s*\)/.test(next)) {
  next = next.replace(
    /(?<!function\s)(?<!async\s+function\s)(?<!await\s)\bapplyAgentAction\s*\(\s*action\s*\)/g,
    "await applyAgentAction(action)",
  );
}
next = next.replace(/await\s+await\s+applyAgentAction/g, "await applyAgentAction");

// Verify candidates is declared before injection point
const beforeRet = next.slice(0, ret + injection.length);
if (!/candidates/.test(beforeRet.slice(insertFrom, ret))) {
  console.warn(
    "WARN: could not verify 'candidates' state before return — check App still defines candidates",
  );
}

fs.writeFileSync(target, next, "utf8");
console.log("Moved applyAgentAction inside App (before return).");
console.log("Backup:", bak);
console.log(`
Next:
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend/gina-backend
  git add frontend/src/App.jsx
  git commit -m "Move applyAgentAction inside App so candidates is in scope"
  git push origin main
`);
