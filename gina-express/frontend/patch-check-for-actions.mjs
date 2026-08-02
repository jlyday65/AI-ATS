#!/usr/bin/env node
/**
 * Fix: Skipped action N: Unknown action type "command_agent"
 *      Skipped action N: Unknown action type "source_candidates_signalhire"
 *
 * Restores applyAgentAction handlers + /ats/run-command support.
 * esbuild-gated. Also ensures Check for actions awaits applyAgentAction.
 *
 * ONE LINE:
 *   node gina-express/frontend/patch-check-for-actions.mjs ~/lyday-gina-backend/gina-backend
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.join(__dirname, "..");
const rootArg = String(process.argv[2] || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");
const root = path.resolve(rootArg);
const ginaDir = fs.existsSync(path.join(root, "frontend", "src", "App.jsx"))
  ? root
  : fs.existsSync(path.join(root, "gina-backend", "frontend", "src", "App.jsx"))
    ? path.join(root, "gina-backend")
    : root;

const appPath = path.join(ginaDir, "frontend", "src", "App.jsx");
if (!fs.existsSync(appPath)) {
  console.error(
    "Usage (one line): node patch-check-for-actions.mjs ~/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

function copy(rel) {
  const src = path.join(pkg, rel);
  const dest = path.join(ginaDir, rel);
  if (!fs.existsSync(src)) {
    console.warn("Skip missing:", rel);
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log("Copied", rel);
}

copy("routes/run-command.js");
copy("routes/kimberley-notes.js");
copy("agents/command-agent.tool.js");
copy("agents/bot-replies.js");
copy("agents/registry.js");
copy("agents/candidate-file.tool.js");
copy("lib/kimberley-notes.js");
copy("lib/candidate-files.js");
copy("lib/candidate-dedupe.js");
copy("maria-source.tool.js");

// Ensure server mounts /ats/run-command
const serverPath = path.join(ginaDir, "server.js");
if (fs.existsSync(serverPath)) {
  let server = fs.readFileSync(serverPath, "utf8");
  const sbak = `${serverPath}.bak-run-command-${Date.now()}`;
  let changed = false;
  if (!/run-command\.js|runCommandRouter|run-command/.test(server)) {
    if (/^import\s+/m.test(server)) {
      server =
        `import runCommandRouter from "./routes/run-command.js";\n` + server;
    } else {
      server =
        `const runCommandRouter = require("./routes/run-command.js");\n` +
        server;
    }
    if (/const\s+app\s*=\s*express\s*\(/.test(server)) {
      server = server.replace(
        /(const\s+app\s*=\s*express\s*\(\s*\)\s*;?)/,
        `$1\napp.use("/ats", runCommandRouter);`,
      );
    } else if (/app\.listen\s*\(/.test(server)) {
      server = server.replace(
        /app\.listen\s*\(/,
        `app.use("/ats", runCommandRouter);\napp.listen(`,
      );
    } else {
      server += `\napp.use("/ats", runCommandRouter);\n`;
    }
    changed = true;
    console.log("Mounted /ats/run-command on server.js");
  } else if (!/app\.use\(\s*["']\/ats["']\s*,\s*runCommandRouter/.test(server) && /import runCommandRouter/.test(server) === false) {
    // import might exist under another name — leave alone
  }
  // If import exists but no mount:
  if (
    /routes\/run-command\.js/.test(server) &&
    !/app\.use\(\s*["']\/ats["'].*runCommand|run-command/.test(
      server.split("import").slice(1).join("import"),
    ) &&
    !/app\.use\(\s*["']\/ats["']\s*,\s*runCommandRouter/.test(server)
  ) {
    // try add mount if missing
    if (!/runCommandRouter/.test(server) && /from\s*["']\.\/routes\/run-command\.js["']/.test(server)) {
      // has default import under another name — skip
    } else if (/runCommandRouter/.test(server) && !/app\.use\(\s*["']\/ats["']\s*,\s*runCommandRouter/.test(server)) {
      server = server.replace(
        /(const\s+app\s*=\s*express\s*\(\s*\)\s*;?)/,
        `$1\napp.use("/ats", runCommandRouter);`,
      );
      changed = true;
    }
  }
  if (changed) {
    fs.copyFileSync(serverPath, sbak);
    fs.writeFileSync(serverPath, server, "utf8");
    console.log("Backup server:", sbak);
  } else {
    console.log("server.js already references run-command");
  }
}

function loadEsbuild() {
  try {
    const req = createRequire(
      path.join(ginaDir, "frontend", "node_modules", "esbuild", "package.json"),
    );
    return req("esbuild");
  } catch {
    return null;
  }
}

function canCompile(esbuild, text) {
  if (!esbuild) return { ok: false, error: "esbuild missing" };
  try {
    esbuild.transformSync(text, {
      loader: "jsx",
      jsx: "automatic",
      logLevel: "silent",
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.errors?.[0]?.text || e.message || e) };
  }
}

function braceEnd(src, braceAt) {
  let depth = 0;
  for (let j = braceAt; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") {
      depth--;
      if (depth === 0) return j + 1;
    }
  }
  return -1;
}

const replacementPath = path.join(__dirname, "applyAgentAction.replacement.js");
const replacement = fs.readFileSync(replacementPath, "utf8");
const cleanStart = replacement.search(
  /function\s+personDedupeKeys\b|const BOT_NAMES\s*=\s*new Set|async function applyAgentAction/,
);
if (cleanStart < 0) {
  console.error("applyAgentAction.replacement.js missing executable block");
  process.exit(2);
}
const CLEAN = replacement.slice(cleanStart).trim();


let src = fs.readFileSync(appPath, "utf8");
const bak = `${appPath}.bak-check-actions-${Date.now()}`;
fs.copyFileSync(appPath, bak);

const esbuild = loadEsbuild();
const before = canCompile(esbuild, src);
if (!before.ok) {
  console.error("App.jsx does not compile before patch:", before.error);
  console.error("Run nuclear-restore-app-jsx.mjs first, then re-run this patch.");
  process.exit(2);
}

// Remove existing dedupe helpers + BOT_NAMES + applyAgentAction (keep one clean copy)
for (let guard = 0; guard < 8; guard++) {
  const dedupe = src.search(/function\s+personDedupeKeys\b/);
  const bot = src.search(/const BOT_NAMES\s*=\s*new Set/);
  const fnAt = src.search(/(?:async\s+)?function\s+(?:await\s+)?applyAgentAction\b/);
  if (dedupe < 0 && bot < 0 && fnAt < 0) break;
  if (fnAt < 0) {
    // orphan helpers / BOT_NAMES
    const start = dedupe >= 0 ? dedupe : bot;
    const isBot = src.search(/function\s+isBotMatch\b/);
    let end = bot >= 0 ? src.indexOf(";", bot) : -1;
    if (isBot >= 0 && (bot < 0 || (isBot > bot && isBot - bot < 200))) {
      const braceAt = src.indexOf("{", isBot);
      const be = braceEnd(src, braceAt);
      if (be > 0) end = be - 1;
    }
    if (start >= 0 && end > start) src = src.slice(0, start) + "\n" + src.slice(end + 1);
    else break;
    continue;
  }
  let start = fnAt;
  if (bot >= 0 && bot < fnAt && fnAt - bot < 800) start = bot;
  if (dedupe >= 0 && dedupe < start && start - dedupe < 4000) start = dedupe;
  const braceAt = src.indexOf("{", fnAt);
  const end = braceEnd(src, braceAt);
  if (end < 0) {
    console.error("Could not find end of applyAgentAction");
    process.exit(2);
  }
  src = src.slice(0, start) + "\n" + src.slice(end);
}

function insertClean(srcText, clean) {
  // Prefer AFTER findCandidateByMatch (usually inside App, near other helpers)
  const findAt = srcText.search(/function\s+findCandidateByMatch\b/);
  if (findAt >= 0) {
    const braceAt = srcText.indexOf("{", findAt);
    const end = braceEnd(srcText, braceAt);
    if (end > 0) {
      return srcText.slice(0, end) + "\n\n" + clean + "\n" + srcText.slice(end);
    }
  }

  // Else: inside App / CandidateTracker, just before `return (`
  const host =
    srcText.search(/export\s+default\s+function\s+(?:App|CandidateTracker)\b/) >= 0
      ? srcText.search(/export\s+default\s+function\s+(?:App|CandidateTracker)\b/)
      : srcText.search(/function\s+(?:App|CandidateTracker)\b/);
  if (host >= 0) {
    const hostBrace = srcText.indexOf("{", host);
    if (hostBrace >= 0) {
      const hostEnd = braceEnd(srcText, hostBrace);
      const body = srcText.slice(hostBrace, hostEnd);
      // last top-level-ish `return (` in the host (prefer before final return JSX)
      const returnRe = /\n(\s*)return\s*\(/g;
      let last = null;
      let m;
      while ((m = returnRe.exec(body))) last = m;
      if (last && last.index > 0) {
        const at = hostBrace + last.index;
        return (
          srcText.slice(0, at) +
          "\n\n" +
          clean +
          "\n" +
          srcText.slice(at)
        );
      }
    }
  }

  return srcText + "\n" + clean + "\n";
}

src = insertClean(src, CLEAN);

// Call sites only — NEVER rewrite `async function applyAgentAction(action)`
// (old lookbehind `(?<!await\s)` alone produced: Expected "(" but found "applyAgentAction")
src = src.replace(
  /async\s+function\s+await\s+applyAgentAction/g,
  "async function applyAgentAction",
);
src = src.replace(
  /(?<!function\s)(?<!async\s+function\s)(?<!await\s)\bapplyAgentAction\s*\(\s*action\s*\)/g,
  "await applyAgentAction(action)",
);
src = src.replace(/await\s+await\s+applyAgentAction/g, "await applyAgentAction");

if (/async\s+function\s+await\s+applyAgentAction/.test(src)) {
  console.error("REFUSING: await rewriter corrupted applyAgentAction declaration");
  fs.copyFileSync(bak, appPath);
  process.exit(2);
}

if (!/type === "command_agent"/.test(src) && !/type === 'command_agent'/.test(src)) {
  console.error("REFUSING: command_agent handler missing after insert");
  process.exit(2);
}

const after = canCompile(esbuild, src);
if (!after.ok) {
  console.error("REFUSING: App.jsx would not compile:", after.error);
  fs.copyFileSync(bak, appPath);
  process.exit(2);
}

fs.writeFileSync(appPath, src, "utf8");
console.log("OK: Check for actions handles command_agent + source_candidates_signalhire");
console.log("Backup:", bak);
console.log("Wrote:", appPath);

// Quick syntax check on run-command
const rc = path.join(ginaDir, "routes/run-command.js");
if (fs.existsSync(rc)) {
  const chk = spawnSync(process.execPath, ["--check", rc], { encoding: "utf8" });
  if (chk.status !== 0) {
    console.warn("Warning: routes/run-command.js --check failed:", chk.stderr);
  }
}

console.log(`
Next:
  node gina-express/frontend/patch-ats-toolbar-links.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
  node gina-express/frontend/patch-bot-nav-branding.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend
  git add gina-backend/frontend/src/App.jsx gina-backend/routes/run-command.js gina-backend/agents gina-backend/lib gina-backend/maria-source.tool.js gina-backend/server.js
  git status
  git commit -m "Fix Check for actions: handle command_agent and Maria sourcing"
  git pull origin main --rebase
  git push origin main

After redeploy: Gina → Check for actions
Expect Kelley/Maria actions to run (not "Unknown action type").
Then open Kimberley Notes.
`);
