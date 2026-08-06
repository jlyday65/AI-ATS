#!/usr/bin/env node
/**
 * Fix: Skipped import_candidate — Can't find variable: candidates
 *
 * Locates the React component that declares `candidates` state and ensures
 * applyAgentAction lives inside that function (before its return).
 *
 * Usage:
 *   node /tmp/patch-move-apply-inside-app.mjs /Users/.../frontend/src/App.jsx
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
  const brace = text.indexOf("{", startIdx);
  if (brace < 0) return null;
  let depth = 0;
  for (let i = brace; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        return { start: startIdx, end: i + 1, body: text.slice(startIdx, i + 1) };
      }
    }
  }
  return null;
}

function expandStart(text, fnStart) {
  let start = fnStart;
  const before = text.slice(Math.max(0, fnStart - 900), fnStart);
  const botRel = before.lastIndexOf("const BOT_NAMES");
  if (botRel >= 0) {
    const abs = Math.max(0, fnStart - 900) + botRel;
    const between = text.slice(abs, fnStart);
    if (/^const BOT_NAMES[\s\S]*?(?:function isBotMatch[\s\S]*)?$/.test(between.trimStart()) ||
        between.includes("const BOT_NAMES")) {
      // only expand if between is mostly helpers
      if (!/\nexport |\nfunction [A-Z]/.test(between.slice(20))) start = abs;
    }
  }
  return start;
}

// Find candidates state declaration
const candRe =
  /const\s*\[\s*candidates\s*,\s*setCandidates\s*\]\s*=\s*useState|const\s+candidates\s*=|let\s+candidates\s*=|candidates\s*,\s*setCandidates/;
const candMatch = src.match(candRe);
if (!candMatch) {
  console.error("Could not find candidates state in", target);
  console.error("Run: grep -n candidates", target, "| head");
  process.exit(1);
}
const candIdx = candMatch.index;
console.log("Found candidates reference at", candIdx);

// Walk backward to the enclosing function declaration
const beforeCand = src.slice(0, candIdx);
const fnHeads = [
  ...beforeCand.matchAll(
    /(?:export\s+default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g,
  ),
  ...beforeCand.matchAll(
    /(?:export\s+default\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/g,
  ),
  ...beforeCand.matchAll(
    /(?:export\s+default\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\s*\(/g,
  ),
];
if (!fnHeads.length) {
  console.error("Could not find enclosing function above candidates");
  // dump nearby function names for the user
  const names = [...beforeCand.matchAll(/function\s+([A-Za-z_$][\w$]*)/g)].slice(-10);
  console.error(
    "Nearby functions:",
    names.map((n) => n[1]).join(", "),
  );
  process.exit(1);
}
const host = fnHeads[fnHeads.length - 1];
const hostName = host[1];
const hostStart = host.index;
console.log("Host component/function:", hostName, "at", hostStart);

const hostBrace = src.indexOf("{", hostStart);
if (hostBrace < 0) {
  console.error("No body for", hostName);
  process.exit(1);
}

// Host end = next sibling top-level/helper function after candidates, or brace match
const afterHost = src.slice(hostBrace + 1);
const sibling = afterHost.search(
  /\n(?:export\s+default\s+)?function\s+[A-Za-z_$]|\nconst\s+[A-Z][A-Za-z0-9_]*\s*=\s*(?:memo\()?function/,
);
// Prefer known helpers
const helperNames =
  /\nfunction\s+(?:JobsView|ResumeTabPanel|ResumeUploadPanel|BoardView|KanbanBoard|CandidateCard|Sidebar)\b/;
const helperAt = afterHost.search(helperNames);

let hostEnd;
if (helperAt >= 0) {
  hostEnd = hostBrace + 1 + helperAt;
} else if (sibling >= 0 && sibling > candIdx - hostBrace) {
  hostEnd = hostBrace + 1 + sibling;
} else {
  let depth = 0;
  hostEnd = -1;
  for (let i = hostBrace; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) {
        hostEnd = i;
        break;
      }
    }
  }
}
if (hostEnd < 0 || hostEnd <= candIdx) {
  console.error("Could not determine end of", hostName);
  process.exit(1);
}
console.log("Host body:", hostBrace, "→", hostEnd);

// Collect applyAgentAction blocks
const fnRe = /(?:async\s+)?function\s+applyAgentAction\b/g;
const fns = [];
let m;
while ((m = fnRe.exec(src))) {
  const block = extractFunctionBlock(src, m.index);
  if (!block) continue;
  const start = expandStart(src, block.start);
  fns.push({
    start,
    end: block.end,
    full: src.slice(start, block.end),
  });
}
if (!fns.length) {
  console.error("No applyAgentAction found — nothing to move");
  process.exit(1);
}

function score(fn) {
  let s = 0;
  if (/source_candidates_signalhire/.test(fn.full)) s += 5;
  if (/import_candidate/.test(fn.full)) s += 5;
  if (/taskHint/.test(fn.full)) s += 3;
  if (/addCandidate/.test(fn.full)) s += 2;
  return s + fn.full.length / 10000;
}
const best = [...fns].sort((a, b) => score(b) - score(a))[0];
console.log(
  "applyAgentAction count:",
  fns.length,
  "best score",
  score(best).toFixed(2),
);

const inside = fns.filter((f) => f.start > hostBrace && f.start < hostEnd);
if (inside.length === 1 && score(inside[0]) >= score(best) - 0.1) {
  console.log("applyAgentAction already inside", hostName, "— ensuring await call sites");
  let next = src;
  next = next.replace(/async\s+function\s+await\s+applyAgentAction/g, "async function applyAgentAction");
  next = next.replace(
    /(?<!function\s)(?<!async\s+function\s)(?<!await\s)\bapplyAgentAction\s*\(\s*action\s*\)/g,
    "await applyAgentAction(action)",
  );
  next = next.replace(/await\s+await\s+applyAgentAction/g, "await applyAgentAction");
  fs.writeFileSync(target, next, "utf8");
  console.log("Updated call sites only. Backup:", bak);
  process.exit(0);
}

// Remove all applyAgentAction blocks (end→start)
let next = src;
const sorted = [...fns].sort((a, b) => b.start - a.start);
for (const f of sorted) {
  const idx = next.indexOf(f.full);
  if (idx < 0) continue;
  const s2 = expandStart(next, idx);
  next = next.slice(0, s2) + next.slice(idx + f.full.length);
}

// Find return ( inside host for insertion
// Re-find host in `next` after removals
const hostRe = new RegExp(
  String.raw`(?:export\s+default\s+)?(?:async\s+)?function\s+${hostName}\s*\(|(?:export\s+default\s+)?const\s+${hostName}\s*=`,
);
const host2 = next.match(hostRe);
if (!host2) {
  console.error("Lost host function after removal:", hostName);
  process.exit(1);
}
const h2Start = host2.index;
const h2Brace = next.indexOf("{", h2Start);
const after2 = next.slice(h2Brace + 1);
const helper2 = after2.search(helperNames);
const h2End = helper2 >= 0 ? h2Brace + 1 + helper2 : next.length;
const section = next.slice(0, h2End);
let ret = section.lastIndexOf("\n  return (");
if (ret < h2Brace) ret = section.lastIndexOf("\n  return(");
if (ret < h2Brace) ret = section.lastIndexOf("\n\treturn (");
if (ret < h2Brace) {
  console.error("Could not find return ( inside", hostName);
  console.error("Tip: open App.jsx and search for applyAgentAction / return (");
  process.exit(1);
}

const injection = `\n\n  ${best.full.trim()}\n\n`;
next = next.slice(0, ret) + injection + next.slice(ret);

next = next.replace(/async\s+function\s+await\s+applyAgentAction/g, "async function applyAgentAction");
next = next.replace(
  /(?<!function\s)(?<!async\s+function\s)(?<!await\s)\bapplyAgentAction\s*\(\s*action\s*\)/g,
  "await applyAgentAction(action)",
);
next = next.replace(/await\s+await\s+applyAgentAction/g, "await applyAgentAction");

fs.writeFileSync(target, next, "utf8");
console.log("Moved applyAgentAction inside", hostName, "before return.");
console.log("Backup:", bak);
console.log(`
Next:
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend/gina-backend
  git add frontend/src/App.jsx
  git commit -m "Move applyAgentAction inside component for candidates scope"
  git push origin main
`);
