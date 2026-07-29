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

// Extract ONLY executable code — never include the file header comments (` * Replace...`)
const fnStart = replacement.search(/const BOT_NAMES\s*=\s*new Set|async function applyAgentAction/);
if (fnStart < 0) {
  console.error("replacement snippet missing applyAgentAction executable block");
  console.error("Use repair-app-jsx-apply-action.mjs instead if App.jsx is already broken.");
  process.exit(1);
}
let fnBlock = replacement.slice(fnStart).trim();
// Strip any leading comment-only lines if present
fnBlock = fnBlock.replace(/^(?:\s*\*[^\n]*\n)+/, "").trim();
if (fnBlock.startsWith("*")) {
  console.error("Refusing to patch: extracted block still looks like a comment. Use repair-app-jsx-apply-action.mjs");
  process.exit(1);
}

let src = fs.readFileSync(appPath, "utf8");
const bak = `${appPath}.bak-cmd-${Date.now()}`;
fs.copyFileSync(appPath, bak);

function braceEnd(text, braceAt) {
  let depth = 0;
  for (let j = braceAt; j < text.length; j++) {
    if (text[j] === "{") depth++;
    else if (text[j] === "}") {
      depth--;
      if (depth === 0) return j + 1;
    }
  }
  return -1;
}

// Remove ALL existing BOT_NAMES / isBotMatch / applyAgentAction copies first
// (re-running this patch used to leave a second BOT_NAMES and break Vite).
for (let guard = 0; guard < 12; guard++) {
  const bot = src.search(/const BOT_NAMES\s*=\s*new Set/);
  const isBot = src.search(/function isBotMatch\s*\(/);
  const fn = src.search(/(?:async\s+)?function applyAgentAction\b/);
  const hits = [bot, isBot, fn].filter((n) => n >= 0);
  if (!hits.length) break;
  let start = Math.min(...hits);
  if (bot >= 0 && fn >= 0 && fn - bot < 400) start = bot;
  else if (fn >= 0) start = fn;

  let end = -1;
  if (fn >= 0 && fn >= start) {
    end = braceEnd(src, src.indexOf("{", fn));
  } else if (isBot >= 0 && isBot >= start) {
    end = braceEnd(src, src.indexOf("{", isBot));
  } else if (bot >= 0) {
    const semi = src.indexOf(";", bot);
    end = semi >= 0 ? semi + 1 : -1;
  }
  if (end < 0) {
    const rest = src.slice(start + 1);
    const nm = rest.match(
      /\n(?:  )?(?:async )?function (?!applyAgentAction|isBotMatch)[A-Za-z_]/,
    );
    if (!nm) {
      console.error("Could not clear old applyAgentAction/BOT_NAMES block");
      process.exit(1);
    }
    end = start + 1 + nm.index;
  }
  src = src.slice(0, start) + src.slice(end);
}

const anchors = [
  "\nfunction JobsView",
  "\n  function JobsView",
  "\nfunction ResumeUploadPanel",
  "\n  function ResumeUploadPanel",
  "\nfunction ResumeTabPanel",
  "\nexport default function App",
  "\nfunction App(",
  "\nfunction KimberleyNotesPanel",
  "\nclass KimberleyNotesGate",
];
let inserted = false;
for (const anchor of anchors) {
  const idx = src.indexOf(anchor);
  if (idx >= 0) {
    src = src.slice(0, idx) + "\n\n  " + fnBlock + "\n" + src.slice(idx);
    inserted = true;
    console.log("Inserted applyAgentAction before", anchor.trim());
    break;
  }
}
if (!inserted) {
  console.error("Could not find insert anchor for applyAgentAction in", appPath);
  console.error("Restore backup:", bak);
  process.exit(1);
}

const botCount = (src.match(/const BOT_NAMES\s*=\s*new Set/g) || []).length;
const fnCount = (src.match(/(?:async\s+)?function applyAgentAction\b/g) || []).length;
if (botCount !== 1 || fnCount !== 1) {
  console.error(
    `Refusing to write: expected 1 BOT_NAMES and 1 applyAgentAction, got ${botCount}/${fnCount}`,
  );
  console.error("Restore backup:", bak);
  process.exit(1);
}

// Call sites only — never touch `async function applyAgentAction(action)`
const callFixed = src.replace(
  /(?<!function )(?<!await )applyAgentAction\s*\(\s*action\s*\)/g,
  "await applyAgentAction(action)",
);
if (callFixed !== src) {
  src = callFixed;
  console.log("Updated call sites to await applyAgentAction(action)");
}
if (/async function await applyAgentAction/.test(src)) {
  console.error("Refusing: await rewriter corrupted the function declaration");
  process.exit(1);
}

fs.writeFileSync(appPath, src, "utf8");
console.log("Patched applyAgentAction in", appPath);
console.log("Backup:", bak);

// Copy server pieces
const agentsDir = path.join(ginaDir, "agents");
fs.mkdirSync(agentsDir, { recursive: true });
fs.mkdirSync(path.join(ginaDir, "routes"), { recursive: true });

fs.mkdirSync(path.join(ginaDir, "lib"), { recursive: true });
const files = [
  ["agents/registry.js", path.join(agentsDir, "registry.js")],
  ["agents/command-agent.tool.js", path.join(agentsDir, "command-agent.tool.js")],
  ["agents/bot-replies.js", path.join(agentsDir, "bot-replies.js")],
  ["lib/kimberley-notes.js", path.join(ginaDir, "lib", "kimberley-notes.js")],
  ["routes/kimberley-notes.js", path.join(ginaDir, "routes", "kimberley-notes.js")],
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
  let changed = false;
  const bakS = `${serverPath}.bak-cmd-${Date.now()}`;
  if (!/run-command/.test(server) && !/runCommandRouter/.test(server)) {
    if (/app\.use\(\s*["']\/ats["']/.test(server)) {
      server = server.replace(
        /app\.use\(\s*["']\/ats["'][^;]*;/,
        (m) => `${m}\napp.use("/ats", runCommandRouter);`,
      );
    } else {
      server += `\napp.use("/ats", runCommandRouter);\n`;
    }
    if (!/^import runCommandRouter/m.test(server)) {
      server = `import runCommandRouter from "./routes/run-command.js";\n` + server;
    }
    changed = true;
    console.log("Mounted run-command router");
  } else {
    console.log("server already references run-command — left unchanged");
  }
  if (!/kimberley-notes|kimberleyNotesRouter/.test(server)) {
    if (/app\.use\(\s*["']\/ats["']/.test(server)) {
      server = server.replace(
        /app\.use\(\s*["']\/ats["'][^;]*;/,
        (m) => `${m}\napp.use("/ats", kimberleyNotesRouter);`,
      );
    } else {
      server += `\napp.use("/ats", kimberleyNotesRouter);\n`;
    }
    if (!/^import kimberleyNotesRouter/m.test(server)) {
      server =
        `import kimberleyNotesRouter from "./routes/kimberley-notes.js";\n` + server;
    }
    changed = true;
    console.log("Mounted kimberley-notes router");
  }
  if (changed) {
    fs.copyFileSync(serverPath, bakS);
    fs.writeFileSync(serverPath, server, "utf8");
    console.log("Patched mount into", serverPath, "(backup", bakS + ")");
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
