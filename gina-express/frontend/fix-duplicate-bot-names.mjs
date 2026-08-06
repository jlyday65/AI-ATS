#!/usr/bin/env node
/**
 * Fix Vite: The symbol "BOT_NAMES" has already been declared
 *
 * Cause: patch-apply-command-actions inserted a second BOT_NAMES + applyAgentAction
 * without removing the first.
 *
 * Usage:
 *   node gina-express/frontend/fix-duplicate-bot-names.mjs \
 *     /Users/jameslyday/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(
  String(process.argv[2] || "").replace(/^~/, process.env.HOME || "").trim(),
);
if (!target || !fs.existsSync(target)) {
  console.error(
    "Usage: node fix-duplicate-bot-names.mjs /Users/jameslyday/lyday-gina-backend/gina-backend/frontend/src/App.jsx",
  );
  process.exit(1);
}

const replacementPath = path.join(__dirname, "applyAgentAction.replacement.js");
const replacement = fs.readFileSync(replacementPath, "utf8");
const fnStart = replacement.search(
  /function\s+personDedupeKeys\b|const BOT_NAMES\s*=\s*new Set|async function applyAgentAction/,
);
if (fnStart < 0) {
  console.error("applyAgentAction.replacement.js missing executable block");
  process.exit(2);
}
const CLEAN = replacement.slice(fnStart).trim();

function braceEnd(src, braceAt) {
  let depth = 0;
  for (let j = braceAt; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") {
      depth--;
      if (depth === 0) return j + 1;
    }
  }
  return -1;
}

function removeAllBlocks(text) {
  let src = text;
  for (let guard = 0; guard < 12; guard++) {
    const dedupe = src.search(/function\s+personDedupeKeys\b/);
    const bot = src.search(/const BOT_NAMES\s*=\s*new Set/);
    const isBot = src.search(/function isBotMatch\s*\(/);
    const fn = src.search(/(?:async\s+)?function applyAgentAction\b/);
    const candidates = [dedupe, bot, isBot, fn].filter((n) => n >= 0);
    if (!candidates.length) break;
    let start = Math.min(...candidates);

    // Prefer cutting from dedupe helpers / BOT_NAMES when just above applyAgentAction
    if (dedupe >= 0 && fn >= 0 && fn - dedupe < 4000) start = dedupe;
    else if (bot >= 0 && fn >= 0 && fn - bot < 800) start = bot;
    else if (isBot >= 0 && fn >= 0 && fn - isBot < 200) start = isBot;
    else if (fn >= 0) start = fn;
    else start = candidates[0];

    let end = -1;
    if (fn >= 0 && fn >= start) {
      const braceAt = src.indexOf("{", fn);
      end = braceEnd(src, braceAt);
    } else if (isBot >= 0 && isBot >= start) {
      const braceAt = src.indexOf("{", isBot);
      end = braceEnd(src, braceAt);
    } else if (bot >= 0) {
      const semi = src.indexOf(";", bot);
      end = semi >= 0 ? semi + 1 : -1;
    }

    if (end < 0) {
      const rest = src.slice(start + 1);
      const m = rest.match(
        /\n(?:  )?(?:async )?function (?!applyAgentAction|isBotMatch)[A-Za-z_]/,
      );
      if (!m) {
        console.error("Could not find end boundary while removing duplicate BOT_NAMES block");
        process.exit(2);
      }
      end = start + 1 + m.index;
    }

    // Also swallow a trailing orphan isBotMatch if we only removed BOT_NAMES somehow
    src = src.slice(0, start) + src.slice(end);
  }

  // Remove orphan isBotMatch left behind
  for (let guard = 0; guard < 5; guard++) {
    const isBot = src.search(/function isBotMatch\s*\(/);
    if (isBot < 0) break;
    const braceAt = src.indexOf("{", isBot);
    const end = braceEnd(src, braceAt);
    if (end < 0) break;
    src = src.slice(0, isBot) + src.slice(end);
  }

  return src;
}

let src = fs.readFileSync(target, "utf8");
const beforeCount = (src.match(/const BOT_NAMES\s*=\s*new Set/g) || []).length;
const bak = `${target}.bak-botnames-${Date.now()}`;
fs.copyFileSync(target, bak);

src = removeAllBlocks(src);

const anchors = [
  "\nfunction JobsView",
  "\n  function JobsView",
  "\nfunction ResumeUploadPanel",
  "\n  function ResumeUploadPanel",
  "\nfunction ResumeTabPanel",
  "\nexport default function App",
  "\nfunction App(",
];
let inserted = false;
for (const anchor of anchors) {
  const idx = src.indexOf(anchor);
  if (idx >= 0) {
    src = src.slice(0, idx) + "\n\n  " + CLEAN + "\n" + src.slice(idx);
    inserted = true;
    console.log("Inserted clean applyAgentAction before", anchor.trim());
    break;
  }
}
if (!inserted) {
  // Fall back: before KimberleyNotesPanel / AgentPanel if present
  const fb = src.search(/\n(?:function|class)\s+KimberleyNotes/);
  if (fb >= 0) {
    src = src.slice(0, fb) + "\n\n  " + CLEAN + "\n" + src.slice(fb);
    inserted = true;
    console.log("Inserted clean applyAgentAction before KimberleyNotes");
  }
}
if (!inserted) {
  console.error("Could not find insert anchor — restore backup:", bak);
  process.exit(2);
}

const afterCount = (src.match(/const BOT_NAMES\s*=\s*new Set/g) || []).length;
if (afterCount !== 1) {
  console.error(`Expected exactly 1 BOT_NAMES, found ${afterCount}. Backup: ${bak}`);
  process.exit(2);
}
if ((src.match(/(?:async\s+)?function applyAgentAction\b/g) || []).length !== 1) {
  console.error("Expected exactly 1 applyAgentAction after repair");
  process.exit(2);
}

// Call sites only — never touch `async function applyAgentAction(action)`
const callFixed = src.replace(
  /(?<!function )(?<!await )applyAgentAction\s*\(\s*action\s*\)/g,
  "await applyAgentAction(action)",
);
if (callFixed !== src) {
  src = callFixed;
  console.log("Updated call sites to await applyAgentAction(action)");
}
if (/async function await applyAgentAction/.test(src)) {
  console.error("Refusing: await rewriter corrupted the function declaration");
  process.exit(2);
}

fs.writeFileSync(target, src, "utf8");
console.log("Before BOT_NAMES count:", beforeCount);
console.log("After BOT_NAMES count:", afterCount);
console.log("Backup:", bak);
console.log("Wrote:", target);
console.log(`
Next:
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend/gina-backend
  git add frontend/src/App.jsx
  git commit -m "Fix duplicate BOT_NAMES in App.jsx"
  git push origin main
`);
