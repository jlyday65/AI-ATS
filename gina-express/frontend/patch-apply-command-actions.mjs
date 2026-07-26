#!/usr/bin/env node
/**
 * Fix: Check for actions skips "Maria" as a missing candidate.
 *
 * Patches App.jsx applyAgentAction to handle command_agent / bot mis-queues,
 * and copies routes/run-command.js + agents into Gina.
 *
 * Usage:
 *   node /tmp/patch-apply-command-actions.mjs ~/lyday-gina-backend
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve((process.argv[2] || process.cwd()).replace(/\/$/, ""));
const RAW =
  "https://raw.githubusercontent.com/jlyday65/AI-ATS/cursor/ai-ats-b2b-platform-4f1f/gina-express";

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (["node_modules", ".git", "dist", ".next"].includes(name)) continue;
    const p = path.join(dir, name);
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
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

async function fetchText(rel, locals) {
  for (const p of locals) {
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  }
  return download(`${RAW}/${rel}`);
}

function findGinaDir() {
  for (const c of [
    path.join(root, "gina-backend"),
    root,
    path.join(root, "lyday-gina-backend", "gina-backend"),
  ]) {
    if (fs.existsSync(c)) return c;
  }
  return root;
}

const ginaDir = findGinaDir();
const appPath =
  walk(ginaDir).find((p) => p.endsWith(`${path.sep}frontend${path.sep}src${path.sep}App.jsx`)) ||
  walk(ginaDir).find((p) => p.endsWith(`${path.sep}frontend${path.sep}App.jsx`));

if (!appPath) {
  console.error("Could not find frontend App.jsx under", ginaDir);
  process.exit(1);
}

const replacement = await fetchText("frontend/applyAgentAction.replacement.js", [
  path.join(__dirname, "applyAgentAction.replacement.js"),
]);

// Extract function body from the snippet file (starts at "const BOT_NAMES" or "async function applyAgentAction")
const fnStart = replacement.search(/const BOT_NAMES|async function applyAgentAction|function applyAgentAction/);
if (fnStart < 0) {
  console.error("replacement snippet missing applyAgentAction");
  process.exit(1);
}
let fnBlock = replacement.slice(fnStart).trim();
// drop trailing comment-only lines noise — keep through last closing of function
// Ensure we have a complete function: if snippet starts with const BOT_NAMES, wrap is already in file as nested in comment context
if (!fnBlock.startsWith("function") && !fnBlock.startsWith("async function")) {
  // snippet has const BOT_NAMES + async function — good as a block to insert before JobsView or replace old function
}

let src = fs.readFileSync(appPath, "utf8");
const bak = `${appPath}.bak-cmd-${Date.now()}`;
fs.copyFileSync(appPath, bak);

const re = /(?:async\s+)?function applyAgentAction\s*\([^)]*\)\s*\{/;
const m = src.match(re);
if (!m) {
  console.error("Could not find function applyAgentAction in", appPath);
  console.error("Backup left unused. Paste applyAgentAction.replacement.js manually.");
  process.exit(1);
}

const start = m.index;
// brace match from first { of the function
let i = src.indexOf("{", start);
let depth = 0;
let end = -1;
for (; i < src.length; i++) {
  const ch = src[i];
  if (ch === "{") depth++;
  else if (ch === "}") {
    depth--;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }
}
if (end < 0) {
  console.error("Could not find end of applyAgentAction");
  process.exit(1);
}

// Also replace a preceding const BOT_NAMES if we re-insert
let replaceFrom = start;
const before = src.slice(Math.max(0, start - 200), start);
const botDecl = before.search(/const BOT_NAMES\s*=\s*new Set/);
if (botDecl >= 0) {
  replaceFrom = Math.max(0, start - 200) + botDecl;
}

const newFn = fnBlock.endsWith("}") ? fnBlock : fnBlock;
src = src.slice(0, replaceFrom) + "\n  " + newFn + "\n" + src.slice(end);

// Ensure Check for actions awaits applyAgentAction
if (/applyAgentAction\s*\(\s*action\s*\)/.test(src) && !/await\s+applyAgentAction\s*\(\s*action\s*\)/.test(src)) {
  src = src.replace(/([^.\w])applyAgentAction\s*\(\s*action\s*\)/g, "$1await applyAgentAction(action)");
  console.log("Updated call sites to await applyAgentAction(action)");
}

fs.writeFileSync(appPath, src, "utf8");
console.log("Patched applyAgentAction in", appPath);
console.log("Backup:", bak);

// Copy server pieces
const agentsDir = path.join(ginaDir, "agents");
fs.mkdirSync(agentsDir, { recursive: true });
fs.mkdirSync(path.join(ginaDir, "routes"), { recursive: true });

const files = [
  ["agents/registry.js", path.join(agentsDir, "registry.js")],
  ["agents/command-agent.tool.js", path.join(agentsDir, "command-agent.tool.js")],
  ["maria-source.tool.js", path.join(ginaDir, "maria-source.tool.js")],
  ["routes/run-command.js", path.join(ginaDir, "routes", "run-command.js")],
];

for (const [rel, dest] of files) {
  const body = await fetchText(rel, [path.join(__dirname, "..", rel)]);
  fs.writeFileSync(dest, body, "utf8");
  console.log("Wrote", dest);
}

// Mount snippet hint in server.js if present
const serverPath = [
  path.join(ginaDir, "server.js"),
  path.join(ginaDir, "index.js"),
].find((p) => fs.existsSync(p));

if (serverPath) {
  let server = fs.readFileSync(serverPath, "utf8");
  if (!/run-command/.test(server) && !/runCommandRouter/.test(server)) {
    const mount = `
import runCommandRouter from "./routes/run-command.js";
app.use("/ats", runCommandRouter);
`;
    const bakS = `${serverPath}.bak-cmd-${Date.now()}`;
    fs.copyFileSync(serverPath, bakS);
    if (/app\.use\(\s*["']\/ats["']/.test(server)) {
      server = server.replace(
        /app\.use\(\s*["']\/ats["'][^;]*;/,
        (m) => `${m}\napp.use("/ats", runCommandRouter);`,
      );
      if (!/runCommandRouter/.test(server.split("app.use")[0])) {
        server = `import runCommandRouter from "./routes/run-command.js";\n` + server;
      }
    } else {
      server = server + "\n" + mount + "\n";
    }
    // Ensure import exists once
    if (!/^import runCommandRouter/m.test(server)) {
      server = `import runCommandRouter from "./routes/run-command.js";\n` + server;
    }
    fs.writeFileSync(serverPath, server, "utf8");
    console.log("Patched mount into", serverPath, "(backup", bakS + ")");
  } else {
    console.log("server already references run-command — left unchanged");
  }
}

console.log(`
Next:
  1) Railway: SIGNALHIRE_BASE_URL + RELAY_SECRET on Gina
  2) SignalHire /ats: same RELAY_SECRET + Gina URL → Test Gina
  3) cd frontend && npm run build
  4) commit/push Gina (not node_modules) → redeploy
  5) Ask Gina again to queue Maria source (action 80 was the bad shape)
  6) Agent → Check for actions  → should call Maria/SignalHire, not look up candidate "Maria"
`);
