#!/usr/bin/env node
/**
 * Fix Kelley/Kelly silent "update" requests from Gina.
 * Syncs bot reply + registry + prompt rule; injects Kelly update rule into gina.js.
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

if (!fs.existsSync(path.join(ginaDir, "gina.js"))) {
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

copy("agents/registry.js");
copy("agents/bot-replies.js");
copy("agents/command-agent.tool.js");
copy("routes/run-command.js");
copy("routes/pipeline-briefing.js");
copy("routes/kimberley-notes.js");
copy("briefing/format-pipeline-stage-counts.js");
copy("GINA_TEAM_PROMPT_RULE.txt");
copy("lib/kimberley-notes.js");

const RULE = `
KELLEY / KELLY UPDATE RULE (required):
When Kimberley asks Gina for an update/status from Kelley or Kelly
(e.g. "ask Kelly for an update", "get a status update from Kelley"),
you MUST queue command_agent with targetAgent "kelley" (alias kelly is OK)
and a clear task like "Provide a pipeline ops status update for Kimberley".
Do NOT answer as Kelley yourself. Do NOT stay silent. Do NOT use update_stage
with match.name Kelley/Kelly.
After queuing, tell Kimberley to run Check for actions.
Kelley's executed reply is filed to BOTH:
  1) Kimberley's Notes (full update)
  2) Gina pipeline summary → Team updates (Kimberley Notes)
When Kimberley later asks for a pipeline summary, you MUST pull live Team updates
from /ats/kimberley-notes/briefing or /ats/pipeline-briefing and include Kelley —
never reply with stage counts alone.
`;

const ginaPath = path.join(ginaDir, "gina.js");
let gina = fs.readFileSync(ginaPath, "utf8");
const bak = `${ginaPath}.bak-kelley-${Date.now()}`;
fs.copyFileSync(ginaPath, bak);

if (!/KELLEY \/ KELLY UPDATE RULE/.test(gina)) {
  if (/GINA TEAM COMMAND RULE|CANDIDATE FILE \(required/.test(gina)) {
    gina = gina.replace(
      /(GINA TEAM COMMAND RULE[\s\S]*?)(\n{2,}(?=[A-Z])|\nexport |\nconst |\nfunction |$)/,
      (_, a, b) => `${a.trim()}\n${RULE.trim()}\n${b}`,
    );
  } else if (/You are Gina/i.test(gina)) {
    gina = gina.replace(/You are Gina[^\n]*/, (m) => `${m}\n${RULE.trim()}\n`);
  } else {
    gina = `${RULE.trim()}\n\n${gina}`;
  }
  console.log("Injected KELLEY / KELLY UPDATE RULE into gina.js");
} else {
  console.log("Kelley update rule already present");
}

// Refresh team prompt block if present as a file paste
const teamRule = fs.readFileSync(
  path.join(ginaDir, "GINA_TEAM_PROMPT_RULE.txt"),
  "utf8",
);
if (/Ask Kelly \/ Kelley for an update/.test(teamRule) && /GINA TEAM COMMAND RULE/.test(gina)) {
  // Soft replace older team rule without Kelly update example
  if (!/Ask Kelly \/ Kelley for an update/.test(gina)) {
    gina = gina.replace(
      /GINA TEAM COMMAND RULE[\s\S]*?(?=\nKELLEY \/ KELLY UPDATE RULE|\nCANDIDATE FILE|\n{2}[A-Z]{3,}|\nexport |\nconst |$)/,
      `${teamRule.trim()}\n\n`,
    );
    console.log("Refreshed GINA TEAM COMMAND RULE (includes Kelly update example)");
  }
}

fs.writeFileSync(ginaPath, gina, "utf8");
const check = spawnSync(process.execPath, ["--check", ginaPath], {
  encoding: "utf8",
});
if (check.status !== 0) {
  console.error("REFUSING: gina.js failed node --check");
  console.error(check.stderr || check.stdout);
  fs.copyFileSync(bak, ginaPath);
  process.exit(2);
}

console.log("OK: gina.js passes node --check");
console.log("Backup:", bak);

// Also wire pipeline briefing so Kelley notes appear under Team updates
const briefPatch = path.join(__dirname, "patch-pipeline-include-team-updates.mjs");
if (fs.existsSync(briefPatch)) {
  console.log("\nWiring Kelley notes into Gina pipeline summary…");
  const brief = spawnSync(process.execPath, [briefPatch, ginaDir], {
    encoding: "utf8",
    stdio: "inherit",
  });
  if (brief.status !== 0) {
    console.warn(
      "Warning: pipeline team-updates patch exited",
      brief.status,
      "— re-run patch-pipeline-include-team-updates.mjs if summary still omits Kelley",
    );
  }
}

console.log(`
OK: Kelley replies file to Kimberley's Notes AND Gina pipeline Team updates.

Next:
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend
  git add gina-backend/agents gina-backend/routes gina-backend/briefing gina-backend/lib gina-backend/GINA_TEAM_PROMPT_RULE.txt gina-backend/gina.js gina-backend/frontend/src/App.jsx gina-backend/server.js
  git status
  git commit -m "Kelley updates go to Kimberley Notes and Gina pipeline summary"
  git pull origin main --rebase
  git push origin main

After Railway redeploy (new Gina chat):
  1) Ask Gina: Ask Kelly for an update
  2) Check for actions → Kimberley Notes (full Kelley reply)
  3) Ask Gina: Give me the pipeline summary
     Expect Team updates (Kimberley Notes) to list Kelley
`);
