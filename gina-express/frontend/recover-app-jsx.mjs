#!/usr/bin/env node
/**
 * Recover frontend/src/App.jsx from git history or local .bak* files.
 *
 * Usage:
 *   node gina-express/frontend/recover-app-jsx.mjs \
 *     /Users/jameslyday/lyday-gina-backend/gina-backend
 */

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const rootArg = String(process.argv[2] || "")
  .replace(/^~/, process.env.HOME || "")
  .trim();
if (!rootArg) {
  console.error(
    "Usage: node recover-app-jsx.mjs /Users/jameslyday/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

const ginaDir = path.resolve(rootArg);
const appPath = [
  path.join(ginaDir, "frontend", "src", "App.jsx"),
  path.join(ginaDir, "frontend", "App.jsx"),
].find((p) => fs.existsSync(p));

if (!appPath) {
  console.error("Could not find App.jsx under", ginaDir);
  process.exit(1);
}

function score(text, label) {
  if (!text || text.length < 5000) return { label, score: -1, reasons: ["too small"] };
  const reasons = [];
  let s = 0;
  const hasApp =
    /function\s+App\b/.test(text) ||
    /export\s+default\s+function\s+App\b/.test(text) ||
    /const\s+App\s*=/.test(text) ||
    /export\s+default\s+App\b/.test(text);
  if (hasApp) {
    s += 50;
    reasons.push("has App");
  } else {
    reasons.push("NO App");
  }
  if (/function\s+AgentPanel\b/.test(text)) {
    s += 10;
    reasons.push("AgentPanel");
  }
  if (/addCandidate|setCandidates|Check for actions|applyAgentAction/.test(text)) {
    s += 10;
    reasons.push("board/actions");
  }
  if (/KimberleyNotes(Gate|Panel)/.test(text)) {
    s -= 20;
    reasons.push("has Kimberley React panel");
  }
  if (/async\s+function\s+await\s+applyAgentAction/.test(text)) {
    s -= 40;
    reasons.push("await typo");
  }
  if ((text.match(/const BOT_NAMES\s*=\s*new Set/g) || []).length > 1) {
    s -= 30;
    reasons.push("duplicate BOT_NAMES");
  }
  if (/Replace the ENTIRE function|IMPORTANT: "Check for actions"/.test(text)) {
    s -= 40;
    reasons.push("junk comments");
  }
  if (/extends\s+Component\b/.test(text) && !/extends\s+React\.Component/.test(text)) {
    s -= 25;
    reasons.push("bare Component");
  }
  return { label, score: s, size: text.length, hasApp, reasons };
}

const bakDir = path.dirname(appPath);
const backups = fs
  .readdirSync(bakDir)
  .filter((n) => n.startsWith("App.jsx"))
  .map((n) => path.join(bakDir, n))
  .filter((p) => fs.statSync(p).isFile());

const candidates = [];

for (const p of backups) {
  try {
    const text = fs.readFileSync(p, "utf8");
    candidates.push({ ...score(text, p), text, source: "backup" });
  } catch {
    // ignore
  }
}

// Walk up for git root
let gitRoot = ginaDir;
for (let i = 0; i < 4; i++) {
  if (fs.existsSync(path.join(gitRoot, ".git"))) break;
  gitRoot = path.dirname(gitRoot);
}

const rel =
  appPath.includes(`${path.sep}gina-backend${path.sep}`)
    ? "gina-backend/frontend/src/App.jsx"
    : "frontend/src/App.jsx";

// Also try without gina-backend prefix
const rels = Array.from(
  new Set([
    path.relative(gitRoot, appPath).split(path.sep).join("/"),
    "frontend/src/App.jsx",
    "gina-backend/frontend/src/App.jsx",
  ]),
);

for (const r of ["HEAD", "HEAD~1", "HEAD~2", "HEAD~3", "HEAD~5", "HEAD~8", "HEAD~12", "main", "origin/main"]) {
  for (const fileRel of rels) {
    const out = spawnSync("git", ["show", `${r}:${fileRel}`], {
      cwd: gitRoot,
      encoding: "utf8",
      maxBuffer: 30 * 1024 * 1024,
    });
    if (out.status === 0 && out.stdout) {
      candidates.push({
        ...score(out.stdout, `git:${r}:${fileRel}`),
        text: out.stdout,
        source: "git",
      });
    }
  }
}

// Log recent commits touching App.jsx for manual pick
console.log("Git root:", gitRoot);
console.log("App path:", appPath);
console.log("\nRecent commits for App.jsx:");
spawnSync(
  "git",
  ["log", "--oneline", "-20", "--", ...rels],
  { cwd: gitRoot, stdio: "inherit" },
);

candidates.sort((a, b) => b.score - a.score || b.size - a.size);
console.log("\nTop candidates:");
for (const c of candidates.slice(0, 12)) {
  console.log(
    `  score=${c.score} hasApp=${c.hasApp} size=${c.size} ${c.label} (${c.reasons.join(", ")})`,
  );
}

const best = candidates.find((c) => c.hasApp && c.score >= 40);
if (!best) {
  console.error(`
No healthy App.jsx candidate found automatically.

Manual recovery:
  cd ${gitRoot}
  git log --oneline -30 -- ${rels[0]}
  git show <GOOD_SHA>:${rels[0]} | head
  git checkout <GOOD_SHA> -- ${rels[0]}
  # if repo root is parent:
  #   git checkout <GOOD_SHA> -- gina-backend/frontend/src/App.jsx
`);
  process.exit(2);
}

const bak = `${appPath}.bak-recover-${Date.now()}`;
fs.copyFileSync(appPath, bak);
fs.writeFileSync(appPath, best.text, "utf8");
console.log("\nRestored from:", best.label);
console.log("Backup of broken file:", bak);
console.log("Wrote:", appPath);

// Strip Notes React UI if present in the restored file
const strip = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "restore-ats-ui.mjs",
);
if (fs.existsSync(strip) && /KimberleyNotes(Gate|Panel)/.test(best.text)) {
  console.log("\nStripping Kimberley React Notes from restored file…");
  spawnSync(process.execPath, [strip, appPath], { stdio: "inherit" });
}

console.log(`
Next:
  cd ${path.join(ginaDir, "frontend")} && npm run build
  cd ${ginaDir}
  git add frontend/src/App.jsx
  # or from parent: git add gina-backend/frontend/src/App.jsx
  git commit -m "Recover App.jsx from known good revision"
  git push origin main

Railway Redeploy → confirm board loads.
Then for Notes use iframe only:
  node ~/AI-ATS/gina-express/frontend/reenable-kimberley-notes-iframe.mjs ${appPath}
`);
