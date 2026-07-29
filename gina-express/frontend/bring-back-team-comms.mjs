#!/usr/bin/env node
/**
 * One-shot: sync Kimberley↔Gina↔Maria/Michelle/Kelley/Ashton files into Gina
 * and safely re-enable Kimberley's Notes (error-boundary gate).
 *
 * Usage:
 *   cd ~/AI-ATS && git pull origin cursor/ai-ats-b2b-platform-4f1f
 *   node gina-express/frontend/bring-back-team-comms.mjs /Users/jameslyday/lyday-gina-backend/gina-backend
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, "..");
const rootArg = String(process.argv[2] || "")
  .replace(/^~/, process.env.HOME || "")
  .trim();

if (!rootArg) {
  console.error(
    "Usage: node bring-back-team-comms.mjs /Users/jameslyday/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

function findGinaDir(root) {
  const candidates = [
    root,
    path.join(root, "gina-backend"),
    path.join(root, "lyday-gina-backend", "gina-backend"),
  ];
  for (const c of candidates) {
    if (
      fs.existsSync(c) &&
      (fs.existsSync(path.join(c, "server.js")) ||
        fs.existsSync(path.join(c, "package.json")) ||
        fs.existsSync(path.join(c, "frontend")))
    ) {
      return c;
    }
  }
  return root;
}

const ginaDir = findGinaDir(path.resolve(rootArg));
console.log("Gina dir:", ginaDir);

const copies = [
  ["agents/registry.js", "agents/registry.js"],
  ["agents/command-agent.tool.js", "agents/command-agent.tool.js"],
  ["agents/bot-replies.js", "agents/bot-replies.js"],
  ["lib/kimberley-notes.js", "lib/kimberley-notes.js"],
  ["routes/kimberley-notes.js", "routes/kimberley-notes.js"],
  ["routes/run-command.js", "routes/run-command.js"],
  ["maria-source.tool.js", "maria-source.tool.js"],
  ["briefing/format-pipeline-stage-counts.js", "briefing/format-pipeline-stage-counts.js"],
  ["GINA_TEAM_PROMPT_RULE.txt", "GINA_TEAM_PROMPT_RULE.txt"],
];

for (const [rel, destRel] of copies) {
  const src = path.join(pkgRoot, rel);
  const dest = path.join(ginaDir, destRel);
  if (!fs.existsSync(src)) {
    console.error("Missing package file:", src);
    process.exit(2);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log("Synced", destRel);
}

// Mount routers in server.js when missing
const serverPath = [path.join(ginaDir, "server.js"), path.join(ginaDir, "index.js")].find(
  (p) => fs.existsSync(p),
);
if (serverPath) {
  let server = fs.readFileSync(serverPath, "utf8");
  let changed = false;
  if (!/run-command|runCommandRouter/.test(server)) {
    if (!/runCommandRouter/.test(server)) {
      server = `import runCommandRouter from "./routes/run-command.js";\n` + server;
    }
    if (/app\.use\(\s*["']\/ats["']/.test(server)) {
      server = server.replace(
        /app\.use\(\s*["']\/ats["'][^;]*;/,
        (m) => `${m}\napp.use("/ats", runCommandRouter);`,
      );
    } else {
      server += `\napp.use("/ats", runCommandRouter);\n`;
    }
    changed = true;
    console.log("Mounted run-command router");
  }
  if (!/kimberley-notes|kimberleyNotesRouter/.test(server)) {
    if (!/kimberleyNotesRouter/.test(server)) {
      server =
        `import kimberleyNotesRouter from "./routes/kimberley-notes.js";\n` + server;
    }
    if (/app\.use\(\s*["']\/ats["']/.test(server)) {
      server = server.replace(
        /app\.use\(\s*["']\/ats["'][^;]*;/,
        (m) => `${m}\napp.use("/ats", kimberleyNotesRouter);`,
      );
    } else {
      server += `\napp.use("/ats", kimberleyNotesRouter);\n`;
    }
    changed = true;
    console.log("Mounted kimberley-notes router");
  }
  if (changed) {
    const bak = `${serverPath}.bak-comms-${Date.now()}`;
    fs.copyFileSync(serverPath, bak);
    fs.writeFileSync(serverPath, server, "utf8");
    console.log("Updated", serverPath, "(backup", bak + ")");
  } else {
    console.log("server mounts already present");
  }
}

const appPathCandidates = [
  path.join(ginaDir, "frontend", "src", "App.jsx"),
  path.join(ginaDir, "frontend", "App.jsx"),
];
const appPath = appPathCandidates.find((p) => fs.existsSync(p));
if (!appPath) {
  console.error("Could not find frontend App.jsx under", ginaDir);
  process.exit(2);
}

const reenable = path.join(__dirname, "reenable-kimberley-notes.mjs");
const r = spawnSync(process.execPath, [reenable, appPath], {
  stdio: "inherit",
});
if (r.status !== 0) process.exit(r.status || 2);

// Keep applyAgentAction capable of team commands when present
const applyPatch = path.join(__dirname, "patch-apply-command-actions.mjs");
if (fs.existsSync(applyPatch)) {
  console.log("\nRefreshing applyAgentAction for Check for actions…");
  const p = spawnSync(process.execPath, [applyPatch, ginaDir], {
    stdio: "inherit",
  });
  if (p.status !== 0) {
    console.warn(
      "applyAgentAction patch returned",
      p.status,
      "- continue if App.jsx already handles command_agent",
    );
  }
}

console.log(`
=== Bring-back complete ===

1) Build frontend:
   cd ${path.join(ginaDir, "frontend")} && npm run build

2) Commit Gina (paths may be under parent git root):
   cd ${ginaDir}
   git add agents lib routes maria-source.tool.js briefing GINA_TEAM_PROMPT_RULE.txt frontend/src/App.jsx server.js
   git status
   git commit -m "Restore team comms: Kimberley Notes + queue/execute handoffs"
   git push origin main

3) Railway → Redeploy Gina. Confirm RELAY_SECRET + SIGNALHIRE_BASE_URL.

4) Soundness check (new chat):
   Ask Gina:
     - Ask Maria to source a Warehouse Mechanic in Atlanta; resumes required
     - Have Michelle screen the Warehouse Mechanic candidates
     - Tell Kelley to move Ava Chen to Screening
     - Get Ashton to draft a follow-up to Ava Chen
   Then: Agent → Check for actions
   Then: Kimberley Notes → Refresh
   Expect one working update per bot (acks replaced), Maria via SignalHire, others with Handoff lines.
`);
