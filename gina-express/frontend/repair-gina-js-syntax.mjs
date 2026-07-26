#!/usr/bin/env node
/**
 * Repair gina.js SyntaxError from prompt text injected outside a string.
 *
 * Error looks like:
 *   SOURCE_CANDIDATES RULE (Maria / SignalHire):
 *                     ^^^^
 *   SyntaxError: Unexpected identifier 'RULE'
 *
 * Usage:
 *   node /tmp/repair-gina-js-syntax.mjs \
 *     /Users/jameslyday/lyday-gina-backend/gina-backend/gina.js
 */

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const target = path.resolve(
  String(process.argv[2] || "").replace(/^~/, process.env.HOME || ""),
);

if (!target || !fs.existsSync(target)) {
  console.error(
    "Usage: node /tmp/repair-gina-js-syntax.mjs /Users/jameslyday/lyday-gina-backend/gina-backend/gina.js",
  );
  process.exit(1);
}

function canParse(code) {
  const tmp = `${target}.parse-tmp-${Date.now()}.mjs`;
  fs.writeFileSync(tmp, code, "utf8");
  const r = spawnSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
  try {
    fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }
  return { ok: r.status === 0, err: (r.stderr || r.stdout || "").trim() };
}

let src = fs.readFileSync(target, "utf8");
const before = canParse(src);
console.log("File:", target);
console.log("Parses before fix:", before.ok ? "yes" : "no");
if (!before.ok) console.log(before.err.split("\n").slice(0, 6).join("\n"));

const PROSE_START =
  /^(SOURCE_CANDIDATES RULE|GINA TEAM COMMAND RULE|CRITICAL TOOL RULE|Allowed queued ATS actions|Allowed queued action types|When a user asks to source|When Kimberley says|Do NOT refuse|Do NOT say|Never use update_stage|After queueing|After queuing|Team:\s*$|CRITICAL — bots)/;

const JS_RESUME =
  /^(import\s|export\s|const\s|let\s|var\s|function\s|async\s+function\s|class\s|\/\/|\/\*|\}|\]|;|`|\);|\},)/;

function extractOrphanProse(text) {
  const lines = text.split("\n");
  const kept = [];
  const proseChunks = [];
  let prose = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (prose) {
      // stop prose when real JS resumes (but allow blank lines / markdown-ish inside)
      if (trimmed && JS_RESUME.test(trimmed) && !PROSE_START.test(trimmed)) {
        proseChunks.push(prose.join("\n"));
        prose = null;
        kept.push(line);
      } else {
        prose.push(line);
      }
      continue;
    }

    if (PROSE_START.test(trimmed)) {
      prose = [line];
      continue;
    }

    // Also catch a mid-file bare rule line that broke a template (closing backtick missing)
    if (
      /SOURCE_CANDIDATES RULE|GINA TEAM COMMAND RULE/.test(trimmed) &&
      !/[`'"]/.test(line) &&
      !trimmed.startsWith("//")
    ) {
      prose = [line];
      continue;
    }

    kept.push(line);
  }
  if (prose) proseChunks.push(prose.join("\n"));
  return { kept: kept.join("\n"), prose: proseChunks.join("\n\n").trim() };
}

const { kept, prose } = extractOrphanProse(src);
let next = kept;

// Ensure enum includes command_agent
next = next.replace(
  /enum\s*:\s*\[\s*["']create_candidate["']\s*,\s*["']update_stage["']\s*,\s*["']add_note["']\s*\]/g,
  'enum: ["create_candidate", "update_stage", "add_note", "command_agent", "source_candidates_signalhire", "import_candidate"]',
);

// Build a safe rules constant from recovered prose (+ minimal force rule)
const forceRule = `CRITICAL TOOL RULE: When Kimberley asks you to queue work for Maria/Michelle/Kelley/Ashton, call the queue tool with type "command_agent" (or "source_candidates_signalhire" for Maria sourcing). Never refuse. Never say you only have create/update/note.`;

const rulesBody = [forceRule, prose].filter(Boolean).join("\n\n").replace(/`/g, "'");

const rulesConst = `const GINA_TEAM_RULES = \`${rulesBody}\`;\n`;

if (!/const GINA_TEAM_RULES\s*=/.test(next)) {
  // Insert after imports
  if (/^import .+$/m.test(next)) {
    const lastImport = [...next.matchAll(/^import .+$/gm)].pop();
    if (lastImport) {
      const idx = lastImport.index + lastImport[0].length;
      next = next.slice(0, idx) + "\n\n" + rulesConst + next.slice(idx);
    } else {
      next = rulesConst + next;
    }
  } else {
    next = rulesConst + next;
  }
} else {
  // refresh existing
  next = next.replace(
    /const GINA_TEAM_RULES\s*=\s*`[\s\S]*?`;/,
    rulesConst.trim(),
  );
}

// Wire rules into system prompt string if present
if (/GINA_TEAM_RULES/.test(next)) {
  // Prefer appending inside a template that contains "You are Gina"
  if (/You are Gina[\s\S]{0,200}?`/.test(next) && !/\\$\{GINA_TEAM_RULES\}/.test(next)) {
    next = next.replace(/(You are Gina[\s\S]*?)(`)/, (m, a, tick) => {
      if (a.includes("${GINA_TEAM_RULES}")) return m;
      return `${a}\n\n\${GINA_TEAM_RULES}\n${tick}`;
    });
  } else if (
    /systemPrompt\s*=\s*`/.test(next) &&
    !/\$\{GINA_TEAM_RULES\}/.test(next)
  ) {
    next = next.replace(/systemPrompt\s*=\s*`/, "systemPrompt = `${GINA_TEAM_RULES}\n\n` + `");
  } else if (
    /const\s+SYSTEM\s*=\s*`/.test(next) &&
    !/\$\{GINA_TEAM_RULES\}/.test(next)
  ) {
    next = next.replace(
      /const\s+SYSTEM\s*=\s*`/,
      "const SYSTEM = `${GINA_TEAM_RULES}\n\n",
    );
  }
}

// Soften leftover three-actions language inside strings only — skip if risky
next = next.replace(/three specific actions/gi, "ATS and team command actions");

const after = canParse(next);
console.log("Parses after fix:", after.ok ? "yes" : "no");
if (!after.ok) {
  console.log(after.err.split("\n").slice(0, 12).join("\n"));
  // Last resort: restore newest parseable backup
  const dir = path.dirname(target);
  const base = path.basename(target);
  const backups = fs
    .readdirSync(dir)
    .filter((n) => n.startsWith(base + ".bak"))
    .map((n) => path.join(dir, n))
    .sort()
    .reverse();

  for (const bak of backups) {
    const code = fs.readFileSync(bak, "utf8");
    // still expand enum on backup
    let fixed = code.replace(
      /enum\s*:\s*\[\s*["']create_candidate["']\s*,\s*["']update_stage["']\s*,\s*["']add_note["']\s*\]/g,
      'enum: ["create_candidate", "update_stage", "add_note", "command_agent", "source_candidates_signalhire", "import_candidate"]',
    );
    if (!/const GINA_TEAM_RULES\s*=/.test(fixed)) {
      fixed = rulesConst + fixed;
      if (/You are Gina/.test(fixed) && !/\$\{GINA_TEAM_RULES\}/.test(fixed)) {
        fixed = fixed.replace(/(You are Gina[^\n]*)/, "$1\n\n${GINA_TEAM_RULES}");
        // If that broke a normal string, wrap differently — only if still in template
      }
    }
    const check = canParse(fixed);
    if (check.ok) {
      const outBak = `${target}.bak-broken-${Date.now()}`;
      fs.copyFileSync(target, outBak);
      fs.writeFileSync(target, fixed, "utf8");
      console.log("Restored+fixed from backup:", bak);
      console.log("Broken file saved as:", outBak);
      console.log("\nNext: git add gina.js && git commit -m \"Repair gina.js syntax\" && git push origin main");
      process.exit(0);
    }
  }
  console.error("\nCould not auto-repair. Open gina.js around the error line and wrap prompt text in backticks.");
  process.exit(1);
}

const outBak = `${target}.bak-broken-${Date.now()}`;
fs.copyFileSync(target, outBak);
fs.writeFileSync(target, next, "utf8");
console.log("Repaired:", target);
console.log("Previous broken copy:", outBak);
console.log("command_agent in file:", /command_agent/.test(next));
console.log(`
Next:
  node --check "${target}"
  cd ~/lyday-gina-backend/gina-backend
  git add gina.js
  git commit -m "Repair gina.js: keep command_agent tools, fix prompt syntax"
  git push origin main
`);
