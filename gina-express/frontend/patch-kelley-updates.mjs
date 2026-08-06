#!/usr/bin/env node
/**
 * Sync bot reply + registry + dual-file rules into Gina.
 * NEVER pastes raw prompt prose into gina.js (that breaks Railway with
 * Unexpected identifier 'task' / 'TEAM'). Uses const GINA_TEAM_RULES = `...`.
 *
 * ONE LINE:
 *   node gina-express/frontend/patch-kelley-updates.mjs ~/lyday-gina-backend/gina-backend
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.join(__dirname, "..");
const rootArg = String(process.argv[2] || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");
const root = path.resolve(rootArg);
const ginaDir = fs.existsSync(path.join(root, "server.js"))
  ? root
  : fs.existsSync(path.join(root, "gina-backend", "server.js"))
    ? path.join(root, "gina-backend")
    : root;

const ginaPath = path.join(ginaDir, "gina.js");
if (!fs.existsSync(ginaPath)) {
  console.error(
    "Usage (one line): node patch-kelley-updates.mjs ~/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

function copy(rel) {
  const src = path.join(pkg, rel);
  const dest = path.join(ginaDir, rel);
  if (!fs.existsSync(src)) {
    console.warn("Skip missing kit file:", rel);
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log("Copied", rel);
}

function canParse(code) {
  const tmp = `${ginaPath}.parse-tmp-${Date.now()}.mjs`;
  fs.writeFileSync(tmp, code, "utf8");
  const r = spawnSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
  try {
    fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }
  return r.status === 0;
}

copy("agents/registry.js");
copy("agents/bot-replies.js");
copy("agents/command-agent.tool.js");
copy("routes/run-command.js");
copy("routes/pipeline-briefing.js");
copy("routes/kimberley-notes.js");
copy("briefing/format-pipeline-stage-counts.js");
copy("GINA_TEAM_PROMPT_RULE.txt");
copy("lib/kimberley-notes.js");

// If gina.js already broken from prior raw paste, repair first
const repair = path.join(__dirname, "repair-gina-js-syntax.mjs");
const pre = spawnSync(process.execPath, ["--check", ginaPath], { encoding: "utf8" });
if (pre.status !== 0) {
  console.log("gina.js does not parse — running repair-gina-js-syntax first…");
  const r = spawnSync(process.execPath, [repair, ginaDir], {
    encoding: "utf8",
    stdio: "inherit",
  });
  if (r.status !== 0) process.exit(2);
}

const teamRule = fs
  .readFileSync(path.join(ginaDir, "GINA_TEAM_PROMPT_RULE.txt"), "utf8")
  .trim()
  .replace(/`/g, "'");

const RULE = `
TEAM BOT UPDATE RULE (required — Maria / Michelle / Kelley / Ashton):
When Kimberley asks Gina for an update/status from ANY team bot
(e.g. "ask Maria for an update", "get a status from Michelle",
"ask Kelly for an update", "ask Ashton for a project status"),
you MUST queue command_agent with the correct targetAgent
(maria | michelle | kelley | ashton; kelly → kelley)
and a clear task like "Provide a status update for Kimberley".
Do NOT answer as that bot yourself. Do NOT stay silent.
Do NOT use update_stage / add_note with match.name set to a bot.
After queuing, tell Kimberley to run Check for actions.
EVERY executed bot reply is dual-filed to BOTH:
  1) Kimberley's Notes (full update)
  2) Gina pipeline summary → Team updates (Kimberley Notes)
When Kimberley later asks for a pipeline summary, you MUST pull live Team updates
from /ats/kimberley-notes/briefing or /ats/pipeline-briefing and include ALL bots
that have filed notes — never reply with stage counts alone.
`.trim();

const rulesBody = [RULE, teamRule].join("\n\n").replace(/`/g, "'");
const rulesConst = `const GINA_TEAM_RULES = \`${rulesBody}\`;`;

let gina = fs.readFileSync(ginaPath, "utf8");
const bak = `${ginaPath}.bak-kelley-${Date.now()}`;
fs.copyFileSync(ginaPath, bak);

if (/const GINA_TEAM_RULES\s*=/.test(gina)) {
  gina = gina.replace(/const GINA_TEAM_RULES\s*=\s*`[\s\S]*?`;/, rulesConst);
  console.log("Refreshed const GINA_TEAM_RULES");
} else {
  if (/^import .+$/m.test(gina)) {
    const lastImport = [...gina.matchAll(/^import .+$/gm)].pop();
    const idx = lastImport.index + lastImport[0].length;
    gina = gina.slice(0, idx) + "\n\n" + rulesConst + "\n" + gina.slice(idx);
  } else {
    gina = rulesConst + "\n\n" + gina;
  }
  console.log("Inserted const GINA_TEAM_RULES (safe — no raw prose paste)");
}

if (!/\$\{GINA_TEAM_RULES\}/.test(gina)) {
  if (/systemPrompt\s*=\s*`/.test(gina)) {
    gina = gina.replace(/systemPrompt\s*=\s*`/, "systemPrompt = `${GINA_TEAM_RULES}\n\n` + `");
    console.log("Wired GINA_TEAM_RULES into systemPrompt");
  } else if (/const\s+SYSTEM\s*=\s*`/.test(gina)) {
    gina = gina.replace(/const\s+SYSTEM\s*=\s*`/, "const SYSTEM = `${GINA_TEAM_RULES}\n\n");
    console.log("Wired GINA_TEAM_RULES into SYSTEM");
  }
}

if (!canParse(gina)) {
  console.error("REFUSING: gina.js would not parse after safe rules inject");
  fs.copyFileSync(bak, ginaPath);
  process.exit(2);
}

fs.writeFileSync(ginaPath, gina, "utf8");
console.log("OK: gina.js passes node --check");
console.log("Backup:", bak);

const briefPatch = path.join(__dirname, "patch-pipeline-include-team-updates.mjs");
if (fs.existsSync(briefPatch)) {
  console.log("\nWiring bot notes into Gina pipeline summary…");
  const brief = spawnSync(process.execPath, [briefPatch, ginaDir], {
    encoding: "utf8",
    stdio: "inherit",
  });
  if (brief.status !== 0) {
    console.warn("Warning: pipeline team-updates patch exited", brief.status);
  }
}

console.log(`
OK: ALL bot replies dual-file to Kimberley's Notes AND Gina pipeline Team updates.
gina.js rules are in const GINA_TEAM_RULES (safe for Railway).

Next:
  node --check ~/lyday-gina-backend/gina-backend/gina.js
  cd ~/lyday-gina-backend
  git add gina-backend/agents gina-backend/routes gina-backend/briefing gina-backend/lib gina-backend/GINA_TEAM_PROMPT_RULE.txt gina-backend/gina.js gina-backend/server.js
  git status
  git commit -m "Safe GINA_TEAM_RULES inject + dual-file bot updates"
  git pull origin main --rebase
  git push origin main
`);
