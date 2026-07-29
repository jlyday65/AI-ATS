#!/usr/bin/env node
/**
 * Wire Gina to create Candidate Files from Kimberley's chat:
 *   "Gina fill out the candidate file and send to Maria"
 *
 * Copies agent tool + prompt rule; injects create_candidate_file into gina.js
 * tool list when a tools array is found.
 *
 * ONE LINE:
 *   node gina-express/frontend/patch-gina-candidate-file-command.mjs ~/lyday-gina-backend/gina-backend
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
    "Usage (one line): node patch-gina-candidate-file-command.mjs ~/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

function copy(rel) {
  const src = path.join(pkg, rel);
  const dest = path.join(ginaDir, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log("Copied", rel);
}

copy("agents/candidate-file.tool.js");
copy("lib/candidate-files.js");
copy("routes/candidate-files.js");
copy("routes/run-command.js");
copy("GINA_TEAM_PROMPT_RULE.txt");

const ginaPath = path.join(ginaDir, "gina.js");
let gina = fs.readFileSync(ginaPath, "utf8");
const bak = `${ginaPath}.bak-cf-cmd-${Date.now()}`;
fs.copyFileSync(ginaPath, bak);

// Ensure prompt rule text is present
const rule = fs.readFileSync(
  path.join(ginaDir, "GINA_TEAM_PROMPT_RULE.txt"),
  "utf8",
);
if (!/CANDIDATE FILE \(required when Kimberley asks\)/.test(gina)) {
  if (/GINA TEAM COMMAND RULE/.test(gina)) {
    // Replace existing team rule block start through a blank line stretch — append CF section near TEAM COMMAND
    gina = gina.replace(
      /GINA TEAM COMMAND RULE[\s\S]*?(?=\n{2,}[A-Z]{3,}|\nexport |\nconst |\nfunction |$)/,
      () => rule.trim() + "\n\n",
    );
  } else if (/You are Gina/i.test(gina)) {
    gina = gina.replace(/You are Gina[^\n]*/, (m) => `${m}\n\n${rule.trim()}\n`);
  } else {
    gina = `${rule.trim()}\n\n${gina}`;
  }
  console.log("Injected Candidate File rule into gina.js");
} else {
  console.log("Candidate File rule already in gina.js");
}

// Import + register tool if tools array exists
if (!/candidate-file\.tool/.test(gina)) {
  if (/^import\s+/m.test(gina)) {
    gina = gina.replace(
      /(^import\s.+;\s*\n)/m,
      `$1import { createCandidateFileTool, createCandidateFileFromInstruction } from "./agents/candidate-file.tool.js";\n`,
    );
  } else {
    gina =
      `import { createCandidateFileTool, createCandidateFileFromInstruction } from "./agents/candidate-file.tool.js";\n` +
      gina;
  }
  console.log("Added candidate-file.tool import");
}

if (!/createCandidateFileTool/.test(gina) || !/name:\s*["']create_candidate_file["']/.test(gina)) {
  // Try to push into a tools = [ ... ] array
  if (/tools\s*=\s*\[/.test(gina) && !/createCandidateFileTool/.test(gina.replace(/import[\s\S]*?from/, ""))) {
    gina = gina.replace(
      /(tools\s*=\s*\[)/,
      `$1\n  createCandidateFileTool,`,
    );
    console.log("Registered createCandidateFileTool in tools array");
  } else if (/const\s+TOOLS\s*=\s*\[/.test(gina)) {
    gina = gina.replace(
      /(const\s+TOOLS\s*=\s*\[)/,
      `$1\n  createCandidateFileTool,`,
    );
    console.log("Registered createCandidateFileTool in TOOLS array");
  } else {
    console.warn(
      "Could not auto-register tool in an array — prompt rule still instructs Gina; API /ats/candidate-files/from-instruction works.",
    );
  }
}

fs.writeFileSync(ginaPath, gina, "utf8");
const check = spawnSync(process.execPath, ["--check", ginaPath], {
  encoding: "utf8",
});
if (check.status !== 0) {
  console.error("REFUSING: gina.js failed node --check after patch");
  console.error(check.stderr || check.stdout);
  fs.copyFileSync(bak, ginaPath);
  process.exit(2);
}

console.log("OK: gina.js passes node --check");
console.log("Backup:", bak);
console.log(`
Next:
  cd ~/lyday-gina-backend
  git add gina-backend/agents/candidate-file.tool.js gina-backend/lib/candidate-files.js gina-backend/routes/candidate-files.js gina-backend/routes/run-command.js gina-backend/GINA_TEAM_PROMPT_RULE.txt gina-backend/gina.js
  git commit -m "Gina: fill Candidate File and send to Maria"
  git push origin main

Then add ATS toolbar button:
  node gina-express/frontend/patch-candidate-file-toolbar.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend && git add gina-backend/frontend/src/App.jsx && git commit -m "Add Candidate File toolbar button" && git push origin main
`);
