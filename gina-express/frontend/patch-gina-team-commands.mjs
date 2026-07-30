#!/usr/bin/env node
/**
 * Wire Gina so Kimberley can command Maria, Michelle, Kelley, and Ashton.
 *
 * Usage:
 *   node /tmp/patch-gina-team-commands.mjs ~/lyday-gina-backend
 *
 * Copies agents/ + prompt rule into Gina and injects the team command rule
 * into prompt / tool files that currently list only create/update/note.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import https from "https";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootArg = process.argv[2] || process.cwd();
const root = path.resolve(rootArg.replace(/\/$/, ""));

const RAW_BASE =
  "https://raw.githubusercontent.com/jlyday65/AI-ATS/cursor/ai-ats-b2b-platform-4f1f/gina-express";

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (["node_modules", ".git", "dist", ".next"].includes(name)) continue;
    // Never touch the React ATS UI — pasting the command rule into App.jsx
    // breaks Vite: Expected ";" but found "TEAM".
    if (/^App\.jsx$/i.test(name) || /\.jsx$/i.test(name)) continue;
    // Never paste prompt rules into Express route/webhook files —
    // breaks Railway: Unexpected identifier 'TEAM' in webhooks.js.
    if (/^webhooks\.js$/i.test(name)) continue;
    const p = path.join(dir, name);
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (name === "routes" || name === "frontend" || name === "node_modules") {
        // still walk agents/lib/briefing but skip routes/* entirely
        if (name === "routes" || name === "frontend") continue;
      }
      walk(p, out);
    } else if (/\.(js|mjs|cjs|ts|tsx|md|txt)$/i.test(name)) out.push(p);
  }
  return out;
}

function download(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          download(res.headers.location).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`GET ${url} → ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      })
      .on("error", reject);
  });
}

async function readOrFetch(localCandidates, remotePath) {
  for (const p of localCandidates) {
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  }
  const tmp = path.join("/tmp", path.basename(remotePath));
  if (fs.existsSync(tmp)) return fs.readFileSync(tmp, "utf8");
  console.log(`Downloading ${remotePath}…`);
  const body = await download(`${RAW_BASE}/${remotePath}`);
  fs.writeFileSync(tmp, body, "utf8");
  return body;
}

function findGinaBackendDir() {
  const candidates = [
    path.join(root, "gina-backend"),
    root,
    path.join(root, "lyday-gina-backend", "gina-backend"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && (fs.existsSync(path.join(c, "server.js")) || fs.existsSync(path.join(c, "package.json")) || fs.existsSync(path.join(c, "frontend")))) {
      return c;
    }
  }
  return root;
}

const ginaDir = findGinaBackendDir();
const agentsDir = path.join(ginaDir, "agents");
fs.mkdirSync(agentsDir, { recursive: true });

const promptText = await readOrFetch(
  [
    path.join(__dirname, "..", "GINA_TEAM_PROMPT_RULE.txt"),
    "/tmp/GINA_TEAM_PROMPT_RULE.txt",
  ],
  "GINA_TEAM_PROMPT_RULE.txt",
);

const registrySrc = await readOrFetch(
  [
    path.join(__dirname, "..", "agents", "registry.js"),
    "/tmp/gina-agents/registry.js",
  ],
  "agents/registry.js",
);

const commandSrc = await readOrFetch(
  [
    path.join(__dirname, "..", "agents", "command-agent.tool.js"),
    "/tmp/gina-agents/command-agent.tool.js",
  ],
  "agents/command-agent.tool.js",
);

const mariaSrc = await readOrFetch(
  [
    path.join(__dirname, "..", "maria-source.tool.js"),
    "/tmp/maria-source.tool.js",
  ],
  "maria-source.tool.js",
);

const botRepliesSrc = await readOrFetch(
  [
    path.join(__dirname, "..", "agents", "bot-replies.js"),
    "/tmp/gina-agents/bot-replies.js",
  ],
  "agents/bot-replies.js",
);

const notesLibSrc = await readOrFetch(
  [
    path.join(__dirname, "..", "lib", "kimberley-notes.js"),
    "/tmp/gina-lib/kimberley-notes.js",
  ],
  "lib/kimberley-notes.js",
);

const notesRouteSrc = await readOrFetch(
  [
    path.join(__dirname, "..", "routes", "kimberley-notes.js"),
    "/tmp/gina-routes/kimberley-notes.js",
  ],
  "routes/kimberley-notes.js",
);

const runCommandSrc = await readOrFetch(
  [
    path.join(__dirname, "..", "routes", "run-command.js"),
    "/tmp/gina-routes/run-command.js",
  ],
  "routes/run-command.js",
);

fs.mkdirSync(path.join(ginaDir, "lib"), { recursive: true });
fs.mkdirSync(path.join(ginaDir, "routes"), { recursive: true });
fs.writeFileSync(path.join(agentsDir, "registry.js"), registrySrc, "utf8");
fs.writeFileSync(path.join(agentsDir, "command-agent.tool.js"), commandSrc, "utf8");
fs.writeFileSync(path.join(agentsDir, "bot-replies.js"), botRepliesSrc, "utf8");
fs.writeFileSync(path.join(ginaDir, "lib", "kimberley-notes.js"), notesLibSrc, "utf8");
fs.writeFileSync(path.join(ginaDir, "routes", "kimberley-notes.js"), notesRouteSrc, "utf8");
fs.writeFileSync(path.join(ginaDir, "routes", "run-command.js"), runCommandSrc, "utf8");
fs.writeFileSync(path.join(ginaDir, "maria-source.tool.js"), mariaSrc, "utf8");
fs.writeFileSync(path.join(ginaDir, "GINA_TEAM_PROMPT_RULE.txt"), promptText, "utf8");
console.log(`Wrote agents + notes + run-command under ${ginaDir}`);

const IMPORT_LINE =
  'import { commandAgentTool, commandAgent } from "./agents/command-agent.tool.js";\n';

let patched = 0;
const files = walk(ginaDir);
for (const file of files) {
  if (file.includes(`${path.sep}agents${path.sep}`)) continue;
  if (file.endsWith("GINA_TEAM_PROMPT_RULE.txt")) continue;
  // Prompt rules belong in gina.js / chat prompt hosts — never routes/*.js
  if (file.includes(`${path.sep}routes${path.sep}`)) continue;
  if (/webhooks\.js$/i.test(file)) continue;
  let src;
  try {
    src = fs.readFileSync(file, "utf8");
  } catch {
    continue;
  }

  const base = path.basename(file);
  const looksLikePromptHost =
    base === "gina.js" ||
    /system prompt/i.test(src) ||
    /You are Gina/i.test(src) ||
    (/create_candidate/.test(src) && /Allowed (ATS )?actions/i.test(src));

  if (!looksLikePromptHost) continue;
  if (/GINA TEAM COMMAND RULE/.test(src) && /command_agent/.test(src)) continue;

  let next = src;
  const changes = [];

  if (!/commandAgentTool|command_agent/.test(next) && /\.(js|mjs|cjs|ts)$/.test(file)) {
    if (/^import\s+/m.test(next)) {
      next = next.replace(/^(import\s.+;\s*\n)/m, `$1${IMPORT_LINE}`);
      changes.push("added commandAgentTool import");
    }
    if (/tools\s*[:=]\s*\[/.test(next) && !/commandAgentTool/.test(next)) {
      next = next.replace(/tools\s*[:=]\s*\[/, (m) => `${m}\n  commandAgentTool,`);
      changes.push("registered commandAgentTool in tools array");
    }
  }

  if (!/GINA TEAM COMMAND RULE/.test(next)) {
    const markers = [
      /Allowed (ATS )?actions[^:]*:\s*/i,
      /You are Gina[^\n]*\n/,
      /available actions[^:]*:\s*/i,
    ];
    let injected = false;
    for (const re of markers) {
      if (re.test(next)) {
        next = next.replace(re, (m) => `${m}\n${promptText}\n\n`);
        changes.push("injected GINA TEAM COMMAND RULE");
        injected = true;
        break;
      }
    }
    if (!injected && (/create_candidate/.test(next) || /You are Gina/i.test(next))) {
      next = `${next}\n\n${promptText}\n`;
      changes.push("appended GINA TEAM COMMAND RULE");
    }
  }

  if (!changes.length || next === src) continue;
  const bak = `${file}.bak-team-${Date.now()}`;
  fs.copyFileSync(file, bak);
  fs.writeFileSync(file, next, "utf8");
  patched += 1;
  console.log(`\nPatched: ${file}`);
  console.log(`Backup: ${bak}`);
  for (const c of changes) console.log(`  - ${c}`);
}

console.log(`
Files copied. Prompt/tool patches applied: ${patched}

If patched = 0, manually paste into Gina's main system prompt:
  ${path.join(ginaDir, "GINA_TEAM_PROMPT_RULE.txt")}

And wire in chat/tools:
  import { commandAgentTool } from "./agents/command-agent.tool.js";
  // tools: [commandAgentTool, ...]

Next:
  cd ${ginaDir}
  git add agents maria-source.tool.js GINA_TEAM_PROMPT_RULE.txt
  git add -u   # review patched files; do NOT add node_modules
  git commit -m "Allow Gina to command Maria, Michelle, Kelley, Ashton"
  git push origin main

Railway: RELAY_SECRET + SIGNALHIRE_BASE_URL → redeploy → retest Kimberley asks.
`);

process.exit(patched > 0 ? 0 : 2);
