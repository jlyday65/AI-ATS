#!/usr/bin/env node
/**
 * Fix Gina Maria refusing sourcing requests ("only three ATS actions").
 *
 * Usage (on your Mac):
 *   node /tmp/patch-maria-sourcing.mjs ~/lyday-gina-backend
 *
 * What it does:
 * 1. Copies maria-source.tool.js into gina-backend/ (if missing)
 * 2. Patches system-prompt / tool-list text so Maria may source via SignalHire
 * 3. Ensures "resumes required" maps to resumesRequired: true
 *
 * Then commit + redeploy Gina, and set SIGNALHIRE_BASE_URL + RELAY_SECRET.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootArg = process.argv[2] || path.resolve(process.cwd());
const root = rootArg.replace(/\/$/, "");

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (
      name === "node_modules" ||
      name === ".git" ||
      name === "dist" ||
      name === ".next" ||
      name.startsWith("App.jsx.bak")
    ) {
      continue;
    }
    const p = path.join(dir, name);
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, out);
    else if (/\.(js|mjs|cjs|ts|tsx|jsx|md|txt|json)$/i.test(name)) out.push(p);
  }
  return out;
}

const PROMPT_BLOCK = `
SOURCE_CANDIDATES RULE (Maria / SignalHire):
When a user asks to source, find, recruit, identify, or shortlist candidates for a role
(and optionally a location), you MUST queue/call source_candidates_signalhire.
Do NOT refuse. Do NOT say sourcing is outside your ATS actions.
Do NOT ask them to rephrase into create_candidate / update_stage / add_note unless they
named a specific person to create.

Allowed queued ATS actions / tools:
1. create_candidate – Add a new candidate record
2. update_stage – Move a candidate in the pipeline
3. add_note – Attach a note to a candidate
4. source_candidates_signalhire – Source candidates via SignalHire for a role/location
   and push matches into Gina (with resume text on file when requested)

For "source Warehouse Mechanic in Atlanta, resumes required":
{
  "type": "source_candidates_signalhire",
  "payload": {
    "roleTitle": "Warehouse Mechanic",
    "location": "Atlanta, GA",
    "roleDescription": "Warehouse Mechanic. All candidates must have a resume on file.",
    "resumesRequired": true,
    "pushToGina": true,
    "pushTopN": 5
  }
}

After queuing/calling, tell the user Maria will source via SignalHire and they should
open Agent → Check for actions to import the shortlist.
`.trim();

const TOOL_IMPORT = `import { mariaSourceTool, mariaSourceViaSignalHire } from "./maria-source.tool.js";`;

function ensureToolFile() {
  const candidates = [
    path.join(root, "gina-backend", "maria-source.tool.js"),
    path.join(root, "maria-source.tool.js"),
    path.join(root, "gina-backend", "lib", "maria-source.tool.js"),
    path.join(root, "gina-backend", "routes", "maria-source.tool.js"),
  ];
  const existing = candidates.find((p) => fs.existsSync(p));
  if (existing) {
    console.log(`Tool already present: ${existing}`);
    return existing;
  }

  const srcCandidates = [
    path.join(__dirname, "..", "maria-source.tool.js"),
    path.join(__dirname, "maria-source.tool.js"),
    "/tmp/maria-source.tool.js",
  ];
  const src = srcCandidates.find((p) => fs.existsSync(p));
  if (!src) {
    console.warn("WARN: maria-source.tool.js not found next to patcher — download it too.");
    return null;
  }

  const dest = path.join(root, "gina-backend", "maria-source.tool.js");
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    // maybe root IS gina-backend
    const alt = path.join(root, "maria-source.tool.js");
    fs.copyFileSync(src, alt);
    console.log(`Copied tool → ${alt}`);
    return alt;
  }
  fs.copyFileSync(src, dest);
  console.log(`Copied tool → ${dest}`);
  return dest;
}

function patchText(src, filePath) {
  let next = src;
  let changed = [];

  // Inject prompt rule near common system-prompt markers
  if (
    /create_candidate/.test(src) &&
    /update_stage|add_note/.test(src) &&
    !/source_candidates_signalhire/.test(src)
  ) {
    // Append after a tools/actions section if we can find it
    const markers = [
      /Allowed (ATS )?actions[^:]*:\s*/i,
      /You can queue[^:]*:\s*/i,
      /available actions[^:]*:\s*/i,
      /ATS actions[^:]*:\s*/i,
    ];
    let injected = false;
    for (const re of markers) {
      if (re.test(next)) {
        next = next.replace(re, (m) => `${m}\n${PROMPT_BLOCK}\n\n`);
        changed.push(`injected SOURCE_CANDIDATES RULE after actions marker`);
        injected = true;
        break;
      }
    }
    if (!injected) {
      // Append at end of large prompt strings that mention create_candidate
      next = `${next}\n\n${PROMPT_BLOCK}\n`;
      changed.push("appended SOURCE_CANDIDATES RULE (no actions marker found)");
    }
  }

  // Soften hard "only three" language if present as source text
  if (/only (these )?three/i.test(next) && /create_candidate|Create a candidate/.test(next)) {
    next = next.replace(/only (these )?three/gi, "these");
    changed.push('softened "only three" language');
  }

  // Add import if maria routes file
  const base = path.basename(filePath);
  if (
    /^maria/i.test(base) &&
    /\.(js|mjs|cjs|ts)$/.test(base) &&
    !/maria-source\.tool/.test(base) &&
    !/mariaSourceTool|mariaSourceViaSignalHire/.test(next)
  ) {
    if (/^import\s+/m.test(next)) {
      next = next.replace(/^(import\s.+;\s*\n)/m, `$1${TOOL_IMPORT}\n`);
      changed.push("added mariaSourceTool import");
    } else if (/^const\s+|^\(async|function\s+/m.test(next)) {
      next = `${TOOL_IMPORT}\n${next}`;
      changed.push("prepended mariaSourceTool import");
    }
  }

  // Register tool in an array of tools if present
  if (
    /tools\s*[:=]\s*\[/.test(next) &&
    !/source_candidates_signalhire|mariaSourceTool/.test(next) &&
    /create_candidate|add_note/.test(next)
  ) {
    next = next.replace(/tools\s*[:=]\s*\[/, (m) => `${m}\n  mariaSourceTool,`);
    changed.push("registered mariaSourceTool in tools array");
  }

  return { next, changed };
}

const toolPath = ensureToolFile();
const files = walk(root);
const hits = files.filter((f) => {
  try {
    const t = fs.readFileSync(f, "utf8");
    return (
      /create_candidate/.test(t) ||
      /update_stage/.test(t) ||
      (/Maria/.test(t) && /ATS actions/i.test(t)) ||
      /You can queue/.test(t)
    );
  } catch {
    return false;
  }
});

console.log(`Scan root: ${root}`);
console.log(`Candidate files: ${hits.length}`);
for (const f of hits.slice(0, 30)) console.log(`  - ${path.relative(root, f)}`);

let patchedCount = 0;
for (const file of hits) {
  const src = fs.readFileSync(file, "utf8");
  if (/SOURCE_CANDIDATES RULE/.test(src) && /source_candidates_signalhire/.test(src)) {
    continue;
  }
  const { next, changed } = patchText(src, file);
  if (!changed.length || next === src) continue;
  const bak = `${file}.bak-maria-${Date.now()}`;
  fs.copyFileSync(file, bak);
  fs.writeFileSync(file, next, "utf8");
  patchedCount += 1;
  console.log(`\nPatched: ${file}`);
  console.log(`Backup: ${bak}`);
  for (const c of changed) console.log(`  - ${c}`);
}

// Always write a drop-in prompt override file for manual paste if auto-patch missed
const dropInDirs = [
  path.join(root, "gina-backend"),
  root,
].filter((d) => fs.existsSync(d));
const dropIn = path.join(dropInDirs[0], "MARIA_SOURCE_PROMPT_RULE.txt");
fs.writeFileSync(dropIn, PROMPT_BLOCK + "\n", "utf8");
console.log(`\nWrote prompt rule file: ${dropIn}`);

if (patchedCount === 0) {
  console.log(`
No automatic prompt patch applied (file patterns may differ).

Manual fix (required):
1. Open Gina Maria system prompt / tools config
2. Paste contents of:
   ${dropIn}
3. Wire tool handler:
   ${toolPath || "(copy maria-source.tool.js into Gina)"}
4. Railway env: SIGNALHIRE_BASE_URL + RELAY_SECRET
5. Redeploy Gina

Then retest:
  "Queue an action for Maria to source a Warehouse Mechanic in Atlanta, GA. Resumes required."
`);
  process.exit(2);
}

console.log(`
Done. Patched ${patchedCount} file(s).

Next:
  cd ~/lyday-gina-backend/gina-backend   # or your git root
  git add -A
  git status   # review — do NOT add node_modules
  git commit -m "Allow Maria to queue source_candidates_signalhire"
  git push origin main

Railway: set SIGNALHIRE_BASE_URL to your SignalHire URL, RELAY_SECRET shared with SignalHire.
Redeploy Gina, then retest Kimberley's sourcing request.
`);
process.exit(0);
