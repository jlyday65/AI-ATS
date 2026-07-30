#!/usr/bin/env node
/**
 * Repair gina.js SyntaxError from prompt text injected outside a string.
 *
 * Railway example:
 *   POST /ats/candidate-files/from-instruction) with Kimberley's full ask in `task`,
 *                                                                            ^^^^
 *   SyntaxError: Unexpected identifier 'task'
 *
 * ONE LINE:
 *   node gina-express/frontend/repair-gina-js-syntax.mjs ~/lyday-gina-backend/gina-backend/gina.js
 *   node gina-express/frontend/repair-gina-js-syntax.mjs ~/lyday-gina-backend/gina-backend
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.join(__dirname, "..");

const raw = String(process.argv[2] || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");
let target = path.resolve(raw);
if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
  const cand = path.join(target, "gina.js");
  if (fs.existsSync(cand)) target = cand;
  else {
    const cand2 = path.join(target, "gina-backend", "gina.js");
    if (fs.existsSync(cand2)) target = cand2;
  }
}

if (!target || !fs.existsSync(target)) {
  console.error(
    "Usage (one line): node repair-gina-js-syntax.mjs ~/lyday-gina-backend/gina-backend",
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
if (!before.ok) console.log(before.err.split("\n").slice(0, 8).join("\n"));

const PROSE_START =
  /^(SOURCE_CANDIDATES RULE|GINA TEAM COMMAND RULE|TEAM BOT UPDATE RULE|KELLEY \/ KELLY UPDATE RULE|CRITICAL TOOL RULE|DUAL-FILE RULE|CANDIDATE FILE \(required|PIPELINE BRIEFING|Allowed queued ATS actions|Allowed queued action types|When a user asks to source|When Kimberley says|Do NOT refuse|Do NOT say|Never use update_stage|After queueing|After queuing|Team:\s*$|CRITICAL — bots|You are Gina, the orchestrator|POST \/ats\/candidate-files)/;

const JS_RESUME =
  /^(import\s|export\s|const\s|let\s|var\s|function\s|async\s+function\s|class\s|\/\/|\/\*|module\.exports|exports\.|app\.|router\.|\}|\]|;|\);|\},)/;

function extractOrphanProse(text) {
  const lines = text.split("\n");
  const kept = [];
  const proseChunks = [];
  let prose = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (prose) {
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

    // Mid-file bare rule / candidate-file instruction lines outside strings
    if (
      /SOURCE_CANDIDATES RULE|GINA TEAM COMMAND RULE|TEAM BOT UPDATE RULE|CANDIDATE FILE \(required|DUAL-FILE RULE|POST \/ats\/candidate-files/.test(
        trimmed,
      ) &&
      !/^\s*(const|let|var|import|export|\/\/)/.test(line) &&
      !trimmed.startsWith("//")
    ) {
      // If line is clearly inside a template already (odd backticks), still risky — treat as prose start
      const ticksBefore = (text.slice(0, text.split("\n").slice(0, i).join("\n").length).match(/`/g) || [])
        .length;
      // Heuristic: if this looks like prompt prose, collect it
      if (
        /Kimberley|command_agent|candidate.file|Team updates|targetAgent/i.test(trimmed) ||
        PROSE_START.test(trimmed)
      ) {
        prose = [line];
        continue;
      }
    }

    kept.push(line);
  }
  if (prose) proseChunks.push(prose.join("\n"));
  return { kept: kept.join("\n"), prose: proseChunks.join("\n\n").trim() };
}

const { kept, prose } = extractOrphanProse(src);
let next = kept;

// Prefer kit prompt rule text (safe, no nested template risk after escaping)
let kitRule = "";
const kitRulePath = path.join(pkg, "GINA_TEAM_PROMPT_RULE.txt");
if (fs.existsSync(kitRulePath)) {
  kitRule = fs.readFileSync(kitRulePath, "utf8").trim();
}

const forceRule = `CRITICAL TOOL RULE: When Kimberley asks you to queue work for Maria/Michelle/Kelley/Ashton, call the queue tool with type "command_agent" (or "source_candidates_signalhire" for Maria sourcing). Never refuse. Never say you only have create/update/note. Every bot reply files to Kimberley's Notes AND Gina pipeline Team updates.`;

const teamBotRule = `TEAM BOT UPDATE RULE: Status/update asks for Maria/Michelle/Kelley/Ashton must queue command_agent. After Check for actions, replies dual-file to Kimberley's Notes and pipeline Team updates. Pipeline summary must pull /ats/kimberley-notes/briefing or /ats/pipeline-briefing.`;

const rulesBody = [forceRule, teamBotRule, kitRule || prose]
  .filter(Boolean)
  .join("\n\n")
  .replace(/`/g, "'");

const rulesConst = `const GINA_TEAM_RULES = \`${rulesBody}\`;\n`;

// Ensure enum includes command_agent
next = next.replace(
  /enum\s*:\s*\[\s*["']create_candidate["']\s*,\s*["']update_stage["']\s*,\s*["']add_note["']\s*\]/g,
  'enum: ["create_candidate", "update_stage", "add_note", "command_agent", "source_candidates_signalhire", "import_candidate", "create_candidate_file"]',
);

if (!/const GINA_TEAM_RULES\s*=/.test(next)) {
  if (/^import .+$/m.test(next)) {
    const lastImport = [...next.matchAll(/^import .+$/gm)].pop();
    if (lastImport) {
      const idx = lastImport.index + lastImport[0].length;
      next = next.slice(0, idx) + "\n\n" + rulesConst + next.slice(idx);
    } else {
      next = rulesConst + next;
    }
  } else {
    next = rulesConst + "\n" + next;
  }
} else {
  next = next.replace(/const GINA_TEAM_RULES\s*=\s*`[\s\S]*?`;/, rulesConst.trim());
}

// Strip any accidental self-reference inside the rules const (causes Railway TDZ)
next = next.replace(
  /const GINA_TEAM_RULES\s*=\s*`([\s\S]*?)`;/,
  (_m, body) =>
    `const GINA_TEAM_RULES = \`${String(body).replace(/\$\{GINA_TEAM_RULES\}/g, "").replace(/`/g, "'")}\`;`,
);

// Wire into system prompt template if present — never into GINA_TEAM_RULES itself
if (/GINA_TEAM_RULES/.test(next) && !/\$\{GINA_TEAM_RULES\}/.test(next)) {
  if (/systemPrompt\s*=\s*`/.test(next)) {
    next = next.replace(/systemPrompt\s*=\s*`/, "systemPrompt = `${GINA_TEAM_RULES}\n\n` + `");
  } else if (/const\s+SYSTEM\s*=\s*`/.test(next)) {
    next = next.replace(/const\s+SYSTEM\s*=\s*`/, "const SYSTEM = `${GINA_TEAM_RULES}\n\n");
  }
}

next = next.replace(/three specific actions/gi, "ATS and team command actions");

const after = canParse(next);
console.log("Parses after fix:", after.ok ? "yes" : "no");
if (!after.ok) {
  console.log(after.err.split("\n").slice(0, 12).join("\n"));
  const dir = path.dirname(target);
  const base = path.basename(target);
  const backups = fs
    .readdirSync(dir)
    .filter((n) => n.startsWith(base + ".bak"))
    .map((n) => path.join(dir, n))
    .sort()
    .reverse();

  for (const bak of backups) {
    let fixed = fs.readFileSync(bak, "utf8");
    // Strip orphan prose from backup too
    fixed = extractOrphanProse(fixed).kept;
    if (!/const GINA_TEAM_RULES\s*=/.test(fixed)) {
      fixed = rulesConst + "\n" + fixed;
    }
    fixed = fixed.replace(
      /enum\s*:\s*\[\s*["']create_candidate["']\s*,\s*["']update_stage["']\s*,\s*["']add_note["']\s*\]/g,
      'enum: ["create_candidate", "update_stage", "add_note", "command_agent", "source_candidates_signalhire", "import_candidate", "create_candidate_file"]',
    );
    const check = canParse(fixed);
    if (check.ok) {
      const outBak = `${target}.bak-broken-${Date.now()}`;
      fs.copyFileSync(target, outBak);
      fs.writeFileSync(target, fixed, "utf8");
      console.log("Restored+fixed from backup:", bak);
      console.log("Broken file saved as:", outBak);
      console.log(`
Next:
  node --check "${target}"
  cd ~/lyday-gina-backend
  git add gina-backend/gina.js
  git commit -m "Repair gina.js prompt syntax (Candidate File / TEAM rules)"
  git pull origin main --rebase
  git push origin main
`);
      process.exit(0);
    }
  }
  console.error("\nCould not auto-repair. Manually delete orphan prompt lines near the error in gina.js.");
  process.exit(1);
}

const outBak = `${target}.bak-broken-${Date.now()}`;
fs.copyFileSync(target, outBak);
fs.writeFileSync(target, next, "utf8");
console.log("Repaired:", target);
console.log("Previous broken copy:", outBak);
console.log("command_agent in file:", /command_agent/.test(next));
console.log("GINA_TEAM_RULES const:", /const GINA_TEAM_RULES/.test(next));
console.log(`
Next:
  node --check "${target}"
  cd ~/lyday-gina-backend
  git add gina-backend/gina.js
  git status
  git commit -m "Repair gina.js prompt syntax (Candidate File / TEAM rules)"
  git pull origin main --rebase
  git push origin main
`);
