#!/usr/bin/env node
/**
 * Nuclear restore of App.jsx — pick a backup/git revision that actually
 * compiles with esbuild. Does NOT insert Notes (get the board building first).
 *
 * ONE LINE:
 *   node gina-express/frontend/nuclear-restore-app-jsx.mjs ~/lyday-gina-backend/gina-backend
 */

import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import {
  resolveAppJsxPath,
  scoreAppJsx,
  isToolbarCorrupt,
} from "./notes-toolbar-markup.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveGinaDir(argv) {
  // Accept either gina-backend dir OR App.jsx path
  const raw = argv
    .slice(2)
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
  if (!raw) return "";
  const home = process.env.HOME || "";
  let expanded = raw;
  if (raw.startsWith("~/")) expanded = path.join(home, raw.slice(2));
  else if (raw === "~") expanded = home;
  expanded = path.resolve(expanded);

  if (expanded.endsWith("App.jsx") && fs.existsSync(expanded)) {
    // .../frontend/src/App.jsx → gina-backend
    return path.resolve(path.dirname(expanded), "..", "..");
  }
  if (fs.existsSync(path.join(expanded, "frontend", "src", "App.jsx"))) {
    return expanded;
  }
  if (fs.existsSync(path.join(expanded, "gina-backend", "frontend", "src", "App.jsx"))) {
    return path.join(expanded, "gina-backend");
  }
  return expanded;
}

function loadEsbuild(ginaDir) {
  const candidates = [
    path.join(ginaDir, "frontend", "node_modules", "esbuild"),
    path.join(ginaDir, "node_modules", "esbuild"),
  ];
  for (const c of candidates) {
    try {
      const req = createRequire(path.join(c, "package.json"));
      return req(c);
    } catch {
      // try next
    }
  }
  return null;
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

const ginaDir = resolveGinaDir(process.argv);
const appPath = path.join(ginaDir, "frontend", "src", "App.jsx");
if (!ginaDir || !fs.existsSync(appPath)) {
  console.error("Could not find", appPath || "(no path)");
  console.error(
    "Usage (one line): node nuclear-restore-app-jsx.mjs ~/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

const esbuild = loadEsbuild(ginaDir);
if (!esbuild) {
  console.error("esbuild not found under", ginaDir, "/frontend/node_modules");
  console.error("Run: cd ~/lyday-gina-backend/gina-backend/frontend && npm install");
  process.exit(1);
}

const bakDir = path.dirname(appPath);
const live = fs.readFileSync(appPath, "utf8");
const liveCompile = canCompile(esbuild, live);
console.log("Live App.jsx compiles?", liveCompile.ok, liveCompile.error || "");
console.log("Live corrupt marker:", isToolbarCorrupt(live));

const files = fs
  .readdirSync(bakDir)
  .filter((n) => n.startsWith("App.jsx"))
  .map((n) => path.join(bakDir, n));

const candidates = [];
for (const p of files) {
  try {
    const text = fs.readFileSync(p, "utf8");
    const scored = scoreAppJsx(text, p);
    const compiled = canCompile(esbuild, text);
    candidates.push({
      ...scored,
      text,
      path: p,
      compiles: compiled.ok,
      compileError: compiled.error || null,
    });
  } catch {
    // ignore
  }
}

// Git history candidates
let gitRoot = ginaDir;
for (let i = 0; i < 4; i++) {
  if (fs.existsSync(path.join(gitRoot, ".git"))) break;
  gitRoot = path.dirname(gitRoot);
}
const rels = [
  path.relative(gitRoot, appPath).split(path.sep).join("/"),
  "gina-backend/frontend/src/App.jsx",
  "frontend/src/App.jsx",
];
// Prefer known-good commits from James's Mac git log first
for (const rev of [
  "b0f53fe",
  "0bef5af",
  "5609d82",
  "ba6e329",
  "HEAD",
  "HEAD~1",
  "HEAD~2",
  "HEAD~3",
  "HEAD~5",
  "HEAD~8",
  "HEAD~12",
  "HEAD~20",
  "main",
  "origin/main",
]) {
  for (const rel of rels) {
    const out = spawnSync("git", ["show", `${rev}:${rel}`], {
      cwd: gitRoot,
      encoding: "utf8",
      maxBuffer: 30 * 1024 * 1024,
    });
    if (out.status !== 0 || !out.stdout) continue;
    const text = out.stdout;
    const scored = scoreAppJsx(text, `git:${rev}:${rel}`);
    const compiled = canCompile(esbuild, text);
    candidates.push({
      ...scored,
      text,
      path: `git:${rev}:${rel}`,
      compiles: compiled.ok,
      compileError: compiled.error || null,
    });
  }
}

candidates.sort((a, b) => {
  if (a.compiles !== b.compiles) return a.compiles ? -1 : 1;
  return b.score - a.score || b.size - a.size;
});

console.log("\nTop candidates (compiles first):");
for (const c of candidates.slice(0, 15)) {
  console.log(
    `  compiles=${c.compiles} score=${c.score} ${path.basename(String(c.label))} (${c.reasons.join(", ")})${c.compiles ? "" : " :: " + c.compileError}`,
  );
}

// esbuild is the source of truth. Prefer clean markers, but accept any compile.
const best =
  candidates.find(
    (c) =>
      c.compiles &&
      c.hasApp &&
      /Add candidate/i.test(c.text) &&
      !isToolbarCorrupt(c.text),
  ) ||
  candidates.find(
    (c) => c.compiles && /Add candidate/i.test(c.text) && c.size > 20000,
  ) ||
  candidates.find((c) => c.compiles && c.hasApp) ||
  candidates.find((c) => c.compiles && c.size > 20000);

if (!best) {
  console.error("\nNo compiling App.jsx candidate found.");
  console.error("Try manual restore from a known-good commit:");
  console.error(`
  cd ~/lyday-gina-backend
  git show b0f53fe:gina-backend/frontend/src/App.jsx > gina-backend/frontend/src/App.jsx
  cd gina-backend/frontend && npm run build
`);
  spawnSync("git", ["log", "--oneline", "-20", "--", ...rels], {
    cwd: gitRoot,
    stdio: "inherit",
  });
  process.exit(2);
}

if (best.path === appPath && liveCompile.ok) {
  console.log("\nLive App.jsx already compiles — nothing to restore.");
  process.exit(0);
}

const safety = `${appPath}.bak-nuclear-${Date.now()}`;
fs.copyFileSync(appPath, safety);
fs.writeFileSync(appPath, best.text, "utf8");

const verify = canCompile(esbuild, fs.readFileSync(appPath, "utf8"));
if (!verify.ok) {
  console.error("REFUSING: wrote file that still fails compile:", verify.error);
  fs.copyFileSync(safety, appPath);
  process.exit(2);
}

console.log("\nOK: restored compiling App.jsx");
console.log("From:", best.label);
console.log("Safety bak of previous broken file:", safety);
console.log("Wrote:", appPath);
console.log(`
Next (board only — no Notes toolbar yet):
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend
  git add gina-backend/frontend/src/App.jsx
  git status
  git commit -m "Restore compiling App.jsx"
  git push origin main

After Railway is healthy, add Notes with the SAFE floating bookmark (does not touch Add candidate):
  cd ~/AI-ATS
  node gina-express/frontend/patch-notes-bookmark-link.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend && git add gina-backend/frontend/src/App.jsx && git commit -m "Add Kimberley Notes bookmark" && git push origin main
`);
