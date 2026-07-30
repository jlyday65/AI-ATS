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
  .replace(/^~(?=$|\/|\\)/, process.env.HOME || "");
let target = path.resolve(raw);

function findGinaJs(start) {
  const tried = [];
  const candidates = [
    start,
    path.join(start, "gina.js"),
    path.join(start, "gina-backend", "gina.js"),
    path.join(start, "gina-backend", "gina-backend", "gina.js"),
  ];
  // If start is lyday-gina-backend root
  if (path.basename(start) === "lyday-gina-backend") {
    candidates.push(path.join(start, "gina-backend", "gina.js"));
  }
  for (const cand of candidates) {
    tried.push(cand);
    try {
      if (fs.existsSync(cand) && fs.statSync(cand).isFile() && /\.js$/i.test(cand)) {
        return { file: cand, tried };
      }
    } catch {
      /* ignore */
    }
  }
  // Shallow search for gina.js under start (max depth 3)
  function walk(dir, depth) {
    if (depth < 0 || !fs.existsSync(dir)) return null;
    let st;
    try {
      st = fs.statSync(dir);
    } catch {
      return null;
    }
    if (!st.isDirectory()) return null;
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch {
      return null;
    }
    if (names.includes("gina.js")) {
      const p = path.join(dir, "gina.js");
      tried.push(p);
      if (fs.statSync(p).isFile()) return p;
    }
    for (const name of names) {
      if (["node_modules", ".git", "dist", "frontend", "routes", "agents"].includes(name)) {
        continue;
      }
      const hit = walk(path.join(dir, name), depth - 1);
      if (hit) return hit;
    }
    return null;
  }
  if (fs.existsSync(start) && fs.statSync(start).isDirectory()) {
    const hit = walk(start, 3);
    if (hit) return { file: hit, tried };
  }
  return { file: null, tried };
}

const resolved = findGinaJs(target);
if (resolved.file) {
  target = resolved.file;
}

if (
  !target ||
  !fs.existsSync(target) ||
  fs.statSync(target).isDirectory() ||
  !/\.js$/i.test(target)
) {
  console.error(
    "Usage (one line): node repair-gina-js-syntax.mjs ~/lyday-gina-backend/gina-backend",
  );
  console.error("Could not find a gina.js file to repair.");
  console.error("Tried:");
  for (const t of resolved.tried || [target]) console.error("  -", t);
  process.exit(1);
}

console.log("Using:", target);

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
  console.log("\nStrip left backtick damage — trying parseable backups as-is…");

  const dir = path.dirname(target);
  const base = path.basename(target);
  const backups = fs
    .readdirSync(dir)
    .filter((n) => n.startsWith(base + ".bak") && !n.includes(".parse-tmp-"))
    .map((n) => path.join(dir, n))
    .map((p) => ({ p, mtime: fs.statSync(p).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const { p: bak } of backups) {
    const rawBak = fs.readFileSync(bak, "utf8");
    // Prefer untouched parseable backup
    if (canParse(rawBak).ok) {
      let fixed = rawBak;
      if (!/const GINA_TEAM_RULES\s*=/.test(fixed)) {
        const trial = rulesConst + "\n" + fixed;
        if (canParse(trial).ok) fixed = trial;
      }
      // Expand enum if safe
      const withEnum = fixed.replace(
        /enum\s*:\s*\[\s*["']create_candidate["']\s*,\s*["']update_stage["']\s*,\s*["']add_note["']\s*\]/g,
        'enum: ["create_candidate", "update_stage", "add_note", "command_agent", "source_candidates_signalhire", "import_candidate", "create_candidate_file"]',
      );
      if (canParse(withEnum).ok) fixed = withEnum;

      if (canParse(fixed).ok) {
        const outBak = `${target}.bak-broken-${Date.now()}`;
        fs.copyFileSync(target, outBak);
        fs.writeFileSync(target, fixed, "utf8");
        console.log("Restored parseable backup as-is:", bak);
        console.log("Broken file saved as:", outBak);
        console.log(`
Next:
  node --check "${target}"
  cd ~/lyday-gina-backend
  git add gina-backend/gina.js
  git commit -m "Restore parseable gina.js from backup"
  git pull origin main --rebase
  git push origin main
`);
        process.exit(0);
      }
    }
  }

  // Last resort: nuclear restore script
  const nuclear = path.join(__dirname, "nuclear-restore-gina-js.mjs");
  if (fs.existsSync(nuclear)) {
    console.log("\nNo usable bak — running nuclear-restore-gina-js.mjs…");
    const r = spawnSync(process.execPath, [nuclear, path.dirname(target)], {
      encoding: "utf8",
      stdio: "inherit",
    });
    process.exit(r.status || 0);
  }

  console.error("\nCould not auto-repair. Run:");
  console.error(
    "  node gina-express/frontend/nuclear-restore-gina-js.mjs ~/lyday-gina-backend/gina-backend",
  );
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
