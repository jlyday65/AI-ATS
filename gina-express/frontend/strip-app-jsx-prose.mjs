#!/usr/bin/env node
/**
 * Remove orphan Gina prompt prose accidentally pasted into App.jsx
 * (Vite: Expected ";" but found "TEAM" at GINA TEAM COMMAND RULE).
 *
 * ONE LINE:
 *   node gina-express/frontend/strip-app-jsx-prose.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 */

import fs from "fs";
import path from "path";
import { createRequire } from "module";

const raw = String(process.argv[2] || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");
let target = path.resolve(raw);
if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
  const cand = path.join(target, "frontend", "src", "App.jsx");
  if (fs.existsSync(cand)) target = cand;
  else {
    const cand2 = path.join(target, "gina-backend", "frontend", "src", "App.jsx");
    if (fs.existsSync(cand2)) target = cand2;
  }
}
if (!target || !fs.existsSync(target)) {
  console.error(
    "Usage (one line): node strip-app-jsx-prose.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx",
  );
  process.exit(1);
}

function loadEsbuild(appFile) {
  const frontend = path.resolve(path.dirname(appFile), "..");
  try {
    const req = createRequire(
      path.join(frontend, "node_modules", "esbuild", "package.json"),
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

let src = fs.readFileSync(target, "utf8");
const bak = `${target}.bak-prose-${Date.now()}`;
fs.copyFileSync(target, bak);

const markers = [
  "SOURCE_CANDIDATES RULE",
  "GINA TEAM COMMAND RULE",
  "CRITICAL TOOL RULE:",
  "KELLEY / KELLY UPDATE RULE",
  "CANDIDATE FILE (required when Kimberley asks)",
  "PIPELINE BRIEFING FORMAT RULE",
];

let cut = -1;
for (const m of markers) {
  // Prefer bare top-level occurrences (not inside a string)
  const re = new RegExp(`(^|\\n)\\s*${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  const match = re.exec(src);
  if (match) {
    const idx = match.index + (match[1] ? match[1].length : 0);
    if (cut < 0 || idx < cut) cut = idx;
  }
}

if (cut < 0) {
  // Fallback: any occurrence in last 40% of file
  for (const m of markers) {
    const idx = src.lastIndexOf(m);
    if (idx >= 0 && idx / src.length > 0.5 && (cut < 0 || idx < cut)) cut = idx;
  }
}

if (cut < 0) {
  console.log("No orphan prompt markers found.");
  process.exit(0);
}

let start = cut;
while (start > 0 && /\s/.test(src[start - 1])) start -= 1;
src = src.slice(0, start).replace(/\s+$/, "") + "\n";

const esbuild = loadEsbuild(target);
const check = canCompile(esbuild, src);
if (!check.ok) {
  console.error("After strip, App.jsx still fails compile:", check.error);
  console.error("Backup kept at", bak, "— trying nuclear restore path recommended.");
  // Still write the strip — usually removes the TEAM error; other issues may remain
}

fs.writeFileSync(target, src, "utf8");
console.log("OK: stripped orphan prompt prose from App.jsx");
console.log("Backup:", bak);
console.log("New size:", src.length);
console.log("Has command_agent handler:", /command_agent/.test(src));
console.log("Compile after strip:", check.ok ? "OK" : check.error);
console.log(`
Next:
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build

If build still fails, restore then re-patch Check for actions:
  node gina-express/frontend/nuclear-restore-app-jsx.mjs ~/lyday-gina-backend/gina-backend
  node gina-express/frontend/patch-check-for-actions.mjs ~/lyday-gina-backend/gina-backend
  node gina-express/frontend/patch-ats-toolbar-links.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
`);
