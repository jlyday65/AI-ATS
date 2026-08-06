#!/usr/bin/env node
/**
 * Fix: Check for actions → "Can't find variable: beginCandidateImportSession"
 *
 * A prior patch injected beginCandidateImportSession() into Check for actions
 * without the helper in that scope. This repair:
 * 1) Refreshes applyAgentAction helpers (incl. window.* exports)
 * 2) Rewrites bare calls to safe window-guarded calls
 *
 * ONE LINE:
 *   node gina-express/frontend/repair-begin-import-session.mjs ~/lyday-gina-backend/gina-backend
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootArg = String(process.argv[2] || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");
if (!rootArg) {
  console.error(
    "Usage: node repair-begin-import-session.mjs ~/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

const root = path.resolve(rootArg);
const ginaDir = fs.existsSync(path.join(root, "frontend", "src", "App.jsx"))
  ? root
  : fs.existsSync(path.join(root, "gina-backend", "frontend", "src", "App.jsx"))
    ? path.join(root, "gina-backend")
    : root;

const appPath = path.join(ginaDir, "frontend", "src", "App.jsx");
if (!fs.existsSync(appPath)) {
  console.error("App.jsx not found:", appPath);
  process.exit(2);
}

// Refresh helpers + applyAgentAction from kit
const check = spawnSync(
  process.execPath,
  [path.join(__dirname, "patch-check-for-actions.mjs"), ginaDir],
  { stdio: "inherit" },
);
if (check.status !== 0) {
  console.error("patch-check-for-actions failed");
  process.exit(check.status || 2);
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
  if (!esbuild) return { ok: true };
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

let src = fs.readFileSync(appPath, "utf8");
const bak = `${appPath}.bak-repair-import-session-${Date.now()}`;
fs.copyFileSync(appPath, bak);

const SAFE_BEGIN = `typeof beginCandidateImportSession === "function" ? beginCandidateImportSession() : typeof window !== "undefined" && typeof window.beginCandidateImportSession === "function" && window.beginCandidateImportSession()`;
const SAFE_DEDUP = `typeof dedupeBoardCandidates === "function" ? dedupeBoardCandidates() : typeof window !== "undefined" && typeof window.dedupeBoardCandidates === "function" && window.dedupeBoardCandidates()`;

// Replace bare calls (not inside function declarations)
src = src.replace(
  /(?<!function\s)beginCandidateImportSession\s*\(\s*\)\s*;?/g,
  (match, offset) => {
    // Skip the function declaration line
    const before = src.slice(Math.max(0, offset - 40), offset);
    if (/function\s*$/.test(before) || /function\s+beginCandidateImportSession/.test(before + match)) {
      return match;
    }
    if (match.includes("typeof")) return match;
    return `${SAFE_BEGIN};`;
  },
);

// More reliable: line-based rewrite for bare statements
src = src
  .split("\n")
  .map((line) => {
    const trimmed = line.trim();
    if (/^function\s+beginCandidateImportSession\b/.test(trimmed)) return line;
    if (/^function\s+dedupeBoardCandidates\b/.test(trimmed)) return line;
    if (
      /^beginCandidateImportSession\s*\(\s*\)\s*;?\s*$/.test(trimmed) &&
      !/typeof/.test(line)
    ) {
      return line.replace(
        /beginCandidateImportSession\s*\(\s*\)\s*;?/,
        `${SAFE_BEGIN};`,
      );
    }
    if (
      /^dedupeBoardCandidates\s*\(\s*\)\s*;?\s*$/.test(trimmed) &&
      !/typeof/.test(line)
    ) {
      return line.replace(
        /dedupeBoardCandidates\s*\(\s*\)\s*;?/,
        `${SAFE_DEDUP};`,
      );
    }
    return line;
  })
  .join("\n");

// Ensure window export exists after dedupeBoardCandidates
if (
  /function\s+beginCandidateImportSession\b/.test(src) &&
  !/window\.beginCandidateImportSession\s*=/.test(src)
) {
  src = src.replace(
    /function\s+dedupeBoardCandidates\s*\([^)]*\)\s*\{[\s\S]*?\n  \}/,
    (block) =>
      `${block}

  if (typeof window !== "undefined") {
    window.beginCandidateImportSession = beginCandidateImportSession;
    window.dedupeBoardCandidates = dedupeBoardCandidates;
  }
`,
  );
  console.log("Attached helpers to window");
}

if (!/function\s+beginCandidateImportSession\b/.test(src)) {
  console.error(
    "REFUSING: beginCandidateImportSession still missing after check-for-actions",
  );
  fs.copyFileSync(bak, appPath);
  process.exit(2);
}

const esbuild = loadEsbuild();
const after = canCompile(esbuild, src);
if (!after.ok) {
  console.error("REFUSING compile:", after.error);
  fs.copyFileSync(bak, appPath);
  process.exit(2);
}

fs.writeFileSync(appPath, src, "utf8");
console.log("OK: Check for actions will not crash on beginCandidateImportSession");
console.log("Backup:", bak);
console.log(`
Next:
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend
  git add gina-backend/frontend/src/App.jsx
  git commit -m "Fix Check for actions: beginCandidateImportSession undefined"
  git pull origin main --rebase && git push origin main

Then hard-refresh Gina ATS and run Check for actions again for Candidate File #251.
`);
