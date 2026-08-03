#!/usr/bin/env node
/**
 * Last-resort white-screen fix: walk git history for App.jsx until one compiles,
 * write it, and STOP (no Education / Board patches).
 *
 *   node gina-express/frontend/emergency-git-restore-app-jsx.mjs ~/lyday-gina-backend
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const rootArg = String(process.argv[2] || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");
if (!rootArg) {
  console.error(
    "Usage: node emergency-git-restore-app-jsx.mjs ~/lyday-gina-backend",
  );
  process.exit(1);
}

const root = path.resolve(rootArg);
const rels = [
  "gina-backend/frontend/src/App.jsx",
  "frontend/src/App.jsx",
];
let gitRoot = root;
let rel = null;
for (const r of rels) {
  const probe = spawnSync("git", ["log", "--oneline", "-1", "--", r], {
    cwd: root,
    encoding: "utf8",
  });
  if (probe.status === 0 && probe.stdout.trim()) {
    rel = r;
    break;
  }
}
if (!rel) {
  // maybe root is gina-backend
  const alt = path.dirname(root);
  for (const r of ["gina-backend/frontend/src/App.jsx", "frontend/src/App.jsx"]) {
    const probe = spawnSync("git", ["log", "--oneline", "-1", "--", r], {
      cwd: alt,
      encoding: "utf8",
    });
    if (probe.status === 0 && probe.stdout.trim()) {
      gitRoot = alt;
      rel = r;
      break;
    }
  }
}
if (!rel) {
  console.error("No git history for App.jsx under", root);
  process.exit(2);
}

const appPath = path.join(gitRoot, rel);
const ginaDir = appPath.includes(`${path.sep}gina-backend${path.sep}`)
  ? path.join(gitRoot, "gina-backend")
  : path.dirname(path.dirname(path.dirname(appPath)));

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

const esbuild = loadEsbuild();
const log = spawnSync(
  "git",
  ["log", "--oneline", "-40", "--", rel],
  { cwd: gitRoot, encoding: "utf8" },
);
const shas = (log.stdout || "")
  .split("\n")
  .map((l) => l.trim().split(/\s+/)[0])
  .filter(Boolean);

console.log(`Scanning ${shas.length} revisions of ${rel} …`);

let chosen = null;
for (const sha of shas) {
  const show = spawnSync("git", ["show", `${sha}:${rel}`], {
    cwd: gitRoot,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (show.status !== 0 || !show.stdout) continue;
  const text = show.stdout;
  if (!/function\s+(?:App|CandidateTracker)\b|export\s+default\s+function\s+App\b/.test(text)) {
    continue;
  }
  // Prefer revisions WITHOUT Notes / Board patches that white-screen at runtime
  const hasNotes =
    /KimberleyNotes(?:Gate|Panel)|view === ["']kimberley["']/.test(text);
  const riskyUi =
    /candidateSourcedFromText\(c\)|candidateEducationText\(active\)|beginCandidateImportSession\s*\(\s*\)/.test(
      text,
    );
  const compile = canCompile(esbuild, text);
  const score =
    (compile.ok ? 1000 : 0) +
    (hasNotes ? -400 : 200) +
    (riskyUi ? -200 : 100) +
    Math.min(200, Math.floor(text.length / 1000));
  console.log(
    `  ${sha} compiles=${compile.ok} notes=${hasNotes} riskyUi=${riskyUi} score=${score} bytes=${text.length}${compile.ok ? "" : " :: " + compile.error}`,
  );
  if (!compile.ok) continue;
  if (!chosen || score > chosen.score) {
    chosen = { sha, text, risky: riskyUi || hasNotes, score, hasNotes };
  }
  // Take the first compiling, Notes-free, low-risk revision
  if (!hasNotes && !riskyUi) break;
}

if (!chosen) {
  console.error("No compiling App.jsx found in recent history.");
  process.exit(2);
}

const bak = `${appPath}.bak-emergency-${Date.now()}`;
if (fs.existsSync(appPath)) fs.copyFileSync(appPath, bak);
fs.writeFileSync(appPath, chosen.text, "utf8");
console.log("\nOK: restored", chosen.sha, "notes=", chosen.hasNotes, "risky=", chosen.risky);
console.log("Backup:", bak);

// Strip Kimberley Notes UI even if the chosen revision still had it
const restoreUi = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "restore-ats-ui.mjs",
);
if (fs.existsSync(restoreUi)) {
  console.log("\n→ restore-ats-ui.mjs (strip Notes white-screen code)");
  const r = spawnSync(process.execPath, [restoreUi, appPath], {
    stdio: "inherit",
  });
  if (r.status !== 0) {
    console.warn("restore-ats-ui exited", r.status, "— continuing");
  }
}

console.log(`
Next (do not re-patch Education/Board/Notes yet):

  cd ${path.join(ginaDir, "frontend")} && npm run build
  cd ${gitRoot}
  git add ${rel}
  git add -u gina-backend/frontend/dist 2>/dev/null || git add -u frontend/dist 2>/dev/null || true
  git status
  git commit -m "Emergency restore App.jsx ${chosen.sha} (clear white screen)"
  git pull origin main --rebase && git push origin main

Railway → Redeploy → Cmd+Shift+R. Confirm Board loads.
If still blank, you should now see a RED error banner — paste that text to Cursor.
`);
