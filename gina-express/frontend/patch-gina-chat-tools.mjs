#!/usr/bin/env node
/**
 * Fix Gina chat refusing Maria sourcing with "three specific actions".
 *
 * Finds the LIVE system prompt / tool schema on disk and injects command_agent
 * + Maria/Michelle/Kelley/Ashton routing.
 *
 * Usage:
 *   node /tmp/patch-gina-chat-tools.mjs ~/lyday-gina-backend
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve((process.argv[2] || process.cwd()).replace(/\/$/, ""));
const RAW =
  "https://raw.githubusercontent.com/jlyday65/AI-ATS/cursor/ai-ats-b2b-platform-4f1f/gina-express";

const TEAM_RULE = `
GINA TEAM COMMAND RULE — REQUIRED:
You can and MUST queue work for Maria, Michelle, Kelley, and Ashton when Kimberley asks.
Do NOT say sourcing is outside your scope. Do NOT claim you only have three ATS actions.
Do NOT offer to "draft a message to Maria" instead of queueing.

Allowed queued action types:
1. create_candidate
2. update_stage
3. add_note
4. command_agent  — command Maria / Michelle / Kelley / Ashton
5. source_candidates_signalhire — Maria sourcing shortcut

When Kimberley says: "queue an action for Maria to source a Warehouse Mechanic in Atlanta, resumes required"
you MUST queue EXACTLY:
{
  "type": "command_agent",
  "payload": {
    "targetAgent": "maria",
    "requestedBy": "Kimberley",
    "task": "Source a Warehouse Mechanic candidate in Atlanta, GA. All candidates must have a resume on file.",
    "resumesRequired": true,
    "roleTitle": "Warehouse Mechanic",
    "location": "Atlanta, GA"
  }
}

Never use update_stage/add_note with match.name "Maria" — Maria is a bot, not a candidate.
After queueing, confirm Action ID and that it is assigned to Maria.
`.trim();

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (["node_modules", ".git", "dist", ".next"].includes(name)) continue;
    if (name.endsWith(".bak") || name.includes(".bak-")) continue;
    // Never paste prompt rules into App.jsx (Vite: Expected ";" but found "TEAM").
    if (/^App\.jsx$/i.test(name) || /\.jsx$/i.test(name)) continue;
    // Never paste into Express webhooks/routes (Railway: Unexpected identifier 'TEAM').
    if (/^webhooks\.js$/i.test(name) || name === "routes") continue;
    const p = path.join(dir, name);
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, out);
    else if (/\.(js|mjs|cjs|ts|tsx|md|txt|json)$/i.test(name)) out.push(p);
  }
  return out;
}

function download(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          download(res.headers.location).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`${url} → ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      })
      .on("error", reject);
  });
}

const REFUSAL_HINTS = [
  /three specific actions/i,
  /falls outside the scope/i,
  /draft a message to her/i,
  /only have three/i,
  /Available actions[:\s]*\n[\s\S]{0,200}create_candidate/i,
  /supports three/i,
  /outside the scope of what I can queue/i,
];

const TOOL_HINTS = [
  /create_candidate/,
  /update_stage/,
  /add_note/,
  /enum.*create_candidate/i,
  /"name"\s*:\s*"create_candidate"/,
];

let patched = 0;
const hits = [];

for (const file of walk(root)) {
  let src;
  try {
    src = fs.readFileSync(file, "utf8");
  } catch {
    continue;
  }

  const refusalScore = REFUSAL_HINTS.reduce((n, re) => n + (re.test(src) ? 1 : 0), 0);
  const toolScore = TOOL_HINTS.reduce((n, re) => n + (re.test(src) ? 1 : 0), 0);
  if (refusalScore === 0 && toolScore < 2) continue;
  if (/GINA TEAM COMMAND RULE — REQUIRED/.test(src)) {
    hits.push({ file, status: "already_has_rule" });
    continue;
  }

  hits.push({ file, refusalScore, toolScore });

  let next = src;
  const changes = [];

  // Soften hard "three actions only" copy in prompt strings
  next = next.replace(/three specific actions/gi, "these ATS / team actions");
  next = next.replace(/only (?:have |supports? )?three(?: specific)? actions/gi, "these actions");
  next = next.replace(
    /Sourcing a candidate is a task assignment[\s\S]{0,400}?How would you like to proceed\?/gi,
    "Sourcing requests must be queued as command_agent for Maria (see GINA TEAM COMMAND RULE).",
  );

  // Expand tool enums if present
  if (/create_candidate["']\s*,\s*["']update_stage["']\s*,\s*["']add_note["']/.test(next) &&
      !/command_agent/.test(next)) {
    next = next.replace(
      /create_candidate(["'])\s*,\s*\1update_stage\1\s*,\s*\1add_note\1/g,
      'create_candidate$1, $1update_stage$1, $1add_note$1, $1command_agent$1, $1source_candidates_signalhire$1',
    );
    changes.push("expanded action type enum");
  }

  // Inject rule near system prompt / tools section
  if (!/GINA TEAM COMMAND RULE — REQUIRED/.test(next)) {
    const markers = [
      /You are Gina[^\n]*\n/,
      /system(?:Prompt|_prompt| prompt)[^\n]*\n/i,
      /Allowed (?:ATS )?actions[^:]*:\s*/i,
      /Available actions[^:]*:\s*/i,
      /create_candidate[^\n]*\n/,
    ];
    let injected = false;
    for (const re of markers) {
      if (re.test(next)) {
        next = next.replace(re, (m) => `${m}\n${TEAM_RULE}\n\n`);
        changes.push("injected GINA TEAM COMMAND RULE");
        injected = true;
        break;
      }
    }
    if (!injected && (refusalScore > 0 || toolScore >= 2)) {
      next = `${TEAM_RULE}\n\n${next}`;
      changes.push("prepended GINA TEAM COMMAND RULE");
    }
  }

  if (next === src) continue;

  const bak = `${file}.bak-chat-${Date.now()}`;
  fs.copyFileSync(file, bak);
  fs.writeFileSync(file, next, "utf8");
  patched += 1;
  console.log(`\nPatched: ${file}`);
  console.log(`Backup: ${bak}`);
  for (const c of changes) console.log(`  - ${c}`);
}

// Always drop a paste file
const ginaDir = fs.existsSync(path.join(root, "gina-backend"))
  ? path.join(root, "gina-backend")
  : root;
fs.mkdirSync(ginaDir, { recursive: true });
const drop = path.join(ginaDir, "GINA_TEAM_PROMPT_RULE.txt");
try {
  const remote = await new Promise((resolve) => {
    download(`${RAW}/GINA_TEAM_PROMPT_RULE.txt`)
      .then(resolve)
      .catch(() => resolve(TEAM_RULE));
  });
  fs.writeFileSync(drop, `${remote}\n\n${TEAM_RULE}\n`, "utf8");
} catch {
  fs.writeFileSync(drop, TEAM_RULE + "\n", "utf8");
}

console.log("\nScan hits:");
for (const h of hits.slice(0, 40)) {
  console.log(
    `  - ${h.file}${h.status ? ` (${h.status})` : ` refusal=${h.refusalScore} tools=${h.toolScore}`}`,
  );
}

console.log(`
Patched files: ${patched}
Prompt drop-in: ${drop}

If patched = 0, find the prompt yourself:
  grep -rn "three specific actions\\|create_candidate\\|falls outside the scope" ~/lyday-gina-backend --include='*.js' --include='*.ts' --include='*.txt' --include='*.md' | head

Then paste ${drop} into that system prompt and redeploy.

After deploy, NEW chat with Gina (old thread may keep old behavior):
  "Queue an action for Maria to source a Warehouse Mechanic in Atlanta, GA. Resumes required."

She must reply that command_agent was queued for Maria — not the three-actions refusal.
`);

process.exit(patched > 0 ? 0 : 2);
