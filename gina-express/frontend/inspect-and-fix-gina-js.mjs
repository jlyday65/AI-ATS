#!/usr/bin/env node
/**
 * Diagnose + force-fix the REAL Gina chat tool list in gina.js
 *
 * The prompt rule files can exist while the model still only receives
 * create_candidate / update_stage / add_note tools — then it refuses Maria.
 *
 * Usage:
 *   node /tmp/inspect-and-fix-gina-js.mjs \
 *     ~/lyday-gina-backend/gina-backend/gina.js
 */

import fs from "fs";
import path from "path";

const target = path.resolve(
  (process.argv[2] || "").replace(/^~/, process.env.HOME || ""),
);

if (!target || !fs.existsSync(target)) {
  console.error("Pass the path to the REAL gina.js that Railway deploys.");
  console.error(
    "Example: node /tmp/inspect-and-fix-gina-js.mjs ~/lyday-gina-backend/gina-backend/gina.js",
  );
  process.exit(1);
}

let src = fs.readFileSync(target, "utf8");

const checks = {
  has_create_candidate: /create_candidate/.test(src),
  has_update_stage: /update_stage/.test(src),
  has_add_note: /add_note/.test(src),
  has_command_agent: /command_agent/.test(src),
  has_source_candidates: /source_candidates_signalhire/.test(src),
  has_team_rule: /GINA TEAM COMMAND RULE/.test(src),
  has_three_specific: /three specific actions/i.test(src),
  has_outside_scope: /outside the scope/i.test(src),
  has_tools_array: /tools\s*[:=]\s*\[/.test(src),
  imports_commandAgentTool: /commandAgentTool/.test(src),
};

console.log("File:", target);
console.log("Size:", src.length);
console.log("Checks:");
for (const [k, v] of Object.entries(checks)) {
  console.log(`  ${v ? "✓" : "✗"} ${k}`);
}

// Show nearby tool / action definitions
const snippets = [];
for (const re of [
  /create_candidate[\s\S]{0,180}/g,
  /enum\s*[:=]\s*\[[^\]]{0,300}/g,
  /name\s*:\s*["']create_candidate["'][\s\S]{0,200}/g,
  /function\s+queue\w*|async function queue\w*|queueAction/g,
]) {
  const m = src.match(re);
  if (m) snippets.push(...m.slice(0, 3));
}
if (snippets.length) {
  console.log("\nRelevant snippets:");
  for (const s of snippets.slice(0, 8)) {
    console.log("---");
    console.log(s.slice(0, 280));
  }
}

const COMMAND_TOOL_OBJ = `{
  name: "queue_ats_action",
  description: "Queue an ATS or team action. Use type command_agent to assign work to Maria, Michelle, Kelley, or Ashton. Use source_candidates_signalhire for Maria sourcing. Do not refuse sourcing.",
  input_schema: {
    type: "object",
    required: ["type", "payload"],
    properties: {
      type: {
        type: "string",
        enum: [
          "create_candidate",
          "update_stage",
          "add_note",
          "command_agent",
          "source_candidates_signalhire",
          "import_candidate"
        ]
      },
      payload: { type: "object" }
    }
  }
}`;

let changed = [];

// 1) Expand any narrow enum that only lists the three types
const enumThree =
  /\[[^\]]*create_candidate[^\]]*update_stage[^\]]*add_note[^\]]*\]/;
if (enumThree.test(src) && !/command_agent/.test(src.match(enumThree)?.[0] || "")) {
  src = src.replace(enumThree, (block) => {
    if (/command_agent/.test(block)) return block;
    return block.replace(
      /add_note(["']?)/,
      'add_note$1, "command_agent", "source_candidates_signalhire", "import_candidate"',
    );
  });
  changed.push("expanded action type enum to include command_agent");
}

// Common pattern: type: { type: "string", enum: ["create_candidate", ...] }
src = src.replace(
  /enum\s*:\s*\[\s*["']create_candidate["']\s*,\s*["']update_stage["']\s*,\s*["']add_note["']\s*\]/g,
  'enum: ["create_candidate", "update_stage", "add_note", "command_agent", "source_candidates_signalhire", "import_candidate"]',
);
if (/command_agent/.test(src) && changed.every((c) => !c.includes("enum"))) {
  // may have been replaced by replace above
  if (fs.readFileSync(target, "utf8") !== src) {
    changed.push("expanded JSON-schema enum for queue tool");
  }
}

// 2) If queue tool description says only three actions, rewrite it
if (/three specific actions|only (?:supports? )?three/i.test(src)) {
  src = src.replace(/three specific actions/gi, "ATS and team command actions");
  src = src.replace(/only (?:supports? |have )?three(?: specific)? actions/gi, "these actions");
  changed.push("softened three-actions language");
}

// 3) Inject system-prompt enforcement near "You are Gina" if tools still lack command_agent wiring in prompt
const FORCE_PROMPT = `
CRITICAL TOOL RULE: When Kimberley asks you to queue work for Maria/Michelle/Kelley/Ashton, call the queue tool with type "command_agent" (or "source_candidates_signalhire" for Maria sourcing). Never refuse. Never say you only have create/update/note.
`.trim();

if (!/CRITICAL TOOL RULE: When Kimberley asks you to queue work for Maria/.test(src)) {
  if (/You are Gina/.test(src)) {
    src = src.replace(/You are Gina[^\n]*/, (m) => `${m}\n\n${FORCE_PROMPT}\n`);
    changed.push("injected CRITICAL TOOL RULE after You are Gina");
  } else if (/system\s*[:=]\s*[`'"]/.test(src) || /systemPrompt/.test(src)) {
    src = src.replace(/(systemPrompt\s*[:=]\s*[`'"])/, `$1${FORCE_PROMPT}\\n\\n`);
    changed.push("injected CRITICAL TOOL RULE into systemPrompt");
  } else {
    src = `${FORCE_PROMPT}\n\n${src}`;
    changed.push("prepended CRITICAL TOOL RULE (no Gina marker found)");
  }
}

// 4) Ensure import + handler mention if file imports tools from elsewhere — add comment anchor
if (/create_candidate/.test(src) && !/command_agent/.test(src)) {
  // Last resort: append a tools push if we see tools = [
  if (/tools\s*=\s*\[/.test(src)) {
    src = src.replace(/tools\s*=\s*\[/, `tools = [\n  ${COMMAND_TOOL_OBJ},`);
    changed.push("prepended queue tool object including command_agent enum");
  }
}

// Deduplicate change list based on actual diff
const original = fs.readFileSync(target, "utf8");
if (src === original) {
  console.log("\nNo textual changes made.");
  if (checks.has_command_agent && checks.has_team_rule) {
    console.log(`
This gina.js ALREADY mentions command_agent + team rule.
If Railway Gina still refuses, the running deploy is probably a DIFFERENT folder:

  gina-backend/
  gina-backend 3/
  gina-backend 4/
  lyday-gina-backend/gina-backend/

Fix:
  1) cd ~/lyday-gina-backend/gina-backend
  2) git rev-parse --show-toplevel
  3) git status
  4) commit + push ONLY that repo's main
  5) Railway → confirm Root Directory / watch path is that same gina-backend
  6) Redeploy
  7) Start a NEW Gina chat (old chat memory will keep refusing)
`);
  } else {
    console.log(`
Could not auto-expand tools. Open the file and search for create_candidate.
Add command_agent to the tool enum, save, commit, push, redeploy, new chat.
`);
  }
  process.exit(checks.has_command_agent ? 0 : 2);
}

const bak = `${target}.bak-inspect-${Date.now()}`;
fs.copyFileSync(target, bak);
fs.writeFileSync(target, src, "utf8");
console.log("\nWrote fixes to", target);
console.log("Backup:", bak);
for (const c of changed) console.log("  -", c);

console.log(`
Verify:
  grep -n "command_agent\\|CRITICAL TOOL RULE\\|three specific" "${target}" | head

Then:
  cd ~/lyday-gina-backend/gina-backend
  git add gina.js
  git commit -m "Force Gina chat tools to allow command_agent for Maria"
  git push origin main
  # Railway redeploy
  # NEW chat — do not continue the old refusal thread
`);
