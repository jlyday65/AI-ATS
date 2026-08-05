#!/usr/bin/env node
/**
 * Stop Gina inventing "New: 64" pipeline tables.
 *
 * Forces Pipeline Stage Counts from the LIVE Board `candidates` array,
 * hardens get_pipeline_summary tool text, and refreshes the Gina team prompt.
 *
 * ONE LINE:
 *   node gina-express/frontend/patch-live-pipeline-counts.mjs ~/lyday-gina-backend/gina-backend
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
if (!rootArg) {
  console.error(
    "Usage: node patch-live-pipeline-counts.mjs ~/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

const root = path.resolve(rootArg);
const ginaDir = fs.existsSync(path.join(root, "frontend", "src", "App.jsx"))
  ? root
  : fs.existsSync(path.join(root, "gina-backend", "frontend", "src", "App.jsx"))
    ? path.join(root, "gina-backend")
    : root;

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

copy("lib/live-stage-counts.js");
copy("briefing/format-pipeline-stage-counts.js");
copy("routes/pipeline-briefing.js");
copy("GINA_TEAM_PROMPT_RULE.txt");

const LIVE_HELPER = `
  /** LIVE Board only — never invent New: 64 from chat memory */
  function countLiveStageCounts(list = []) {
    const counts = {
      new: 0,
      screening: 0,
      interview: 0,
      offer: 0,
      hired: 0,
      rejected: 0,
    };
    for (const c of Array.isArray(list) ? list : []) {
      let s = String(c.stage || c.status || "new")
        .trim()
        .toLowerCase()
        .replace(/[\\s-]+/g, "_");
      if (
        s === "phone_screen" ||
        s === "phonescreen" ||
        s === "pre_screen" ||
        s === "prescreen" ||
        s === "screen"
      ) {
        s = "screening";
      }
      if (!(s in counts)) s = "new";
      counts[s] += 1;
    }
    return counts;
  }
`.trim();

const CLEAN_DESC =
  "Return a Pipeline overview formatted like Kimberley's Notes from LIVE Board counts only (section headers, blank lines, • bullets, light emojis OK). Lead with Pipeline Stage Counts, then Jobs in pipeline (Job Title, Names in Screening, Names Interviewing, Candidate Hired). If the Board is empty, every stage is 0 — NEVER invent totals (e.g. New: 64), NEVER reuse an old dated snapshot, NEVER use markdown tables or Key Takeaways. Always include Team updates as Ask + full reply blocks from /ats/kimberley-notes/briefing or /ats/pipeline-briefing. Do not suggest Michelle screen candidates when New is 0.";

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

// --- App.jsx: live counts ---
const appPath = path.join(ginaDir, "frontend", "src", "App.jsx");
if (fs.existsSync(appPath)) {
  let app = fs.readFileSync(appPath, "utf8");
  const bak = `${appPath}.bak-live-counts-${Date.now()}`;
  fs.copyFileSync(appPath, bak);
  const esbuild = loadEsbuild();

  if (!/function\s+countLiveStageCounts\b/.test(app)) {
    const insertAt = app.search(
      /function\s+formatPipelineStageCountsLocal\b|function\s+GinaBriefingCard\b|async\s+function\s+sendDailySummary\b|function\s+sendDailySummary\b|const BOT_NAMES\s*=/,
    );
    if (insertAt >= 0) {
      app = app.slice(0, insertAt) + LIVE_HELPER + "\n\n" + app.slice(insertAt);
      console.log("Inserted countLiveStageCounts helper");
    } else {
      app = LIVE_HELPER + "\n\n" + app;
      console.log("Prepended countLiveStageCounts helper");
    }
  }

  // Force stageCounts = live Board before any summary object that embeds stageCounts
  if (!/countLiveStageCounts\(\s*candidates\s*\)/.test(app)) {
    app = app.replace(
      /(const\s+summary\s*=\s*\{[\s\S]*?stageCounts[\s\S]*?\};)/g,
      (block) => {
        if (/countLiveStageCounts\(/.test(block)) return block;
        return (
          `const stageCounts = countLiveStageCounts(candidates);\n      ` +
          block.replace(
            /stageCounts\s*:\s*[^,}\n]+/,
            "stageCounts: stageCounts",
          )
        );
      },
    );
    // Also rewrite loose stageCounts vars near briefing send
    app = app.replace(
      /const\s+stageCounts\s*=\s*(?!countLiveStageCounts)[^;]+;/g,
      "const stageCounts = countLiveStageCounts(candidates);",
    );
    console.log("Wired stageCounts from live Board candidates");
  }

  const after = canCompile(esbuild, app);
  if (!after.ok) {
    console.error("REFUSING App.jsx compile:", after.error);
    fs.copyFileSync(bak, appPath);
    process.exit(2);
  }
  fs.writeFileSync(appPath, app, "utf8");
  console.log("Patched", appPath);
  console.log("Backup:", bak);
} else {
  console.warn("App.jsx not found");
}

// --- gina.js tool description ---
const ginaJs = path.join(ginaDir, "gina.js");
if (fs.existsSync(ginaJs)) {
  const fixer = path.join(__dirname, "fix-gina-pipeline-description.mjs");
  // Update CLEAN_DESC inside fixer file is already done separately; run fixer then overwrite desc
  let gina = fs.readFileSync(ginaJs, "utf8");
  const gbak = `${ginaJs}.bak-live-counts-${Date.now()}`;
  fs.copyFileSync(ginaJs, gbak);

  if (/get_pipeline_summary/.test(gina)) {
    const nameIdx = gina.search(/name:\s*["']get_pipeline_summary["']/);
    if (nameIdx >= 0) {
      const window = gina.slice(nameIdx, nameIdx + 2500);
      const descKey = window.search(/description:\s*/);
      if (descKey >= 0) {
        const abs = nameIdx + descKey;
        const m = gina.slice(abs).match(/^description:\s*(["'`])/);
        if (m) {
          const quote = m[1];
          const valueStart = abs + m[0].length;
          let valueEnd = -1;
          if (quote === "`") valueEnd = gina.indexOf("`", valueStart);
          else {
            const tail = gina.slice(valueStart);
            const endMatch = tail.match(
              /["']\s*,\s*\n\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*:/,
            );
            if (endMatch) valueEnd = valueStart + endMatch.index;
            else {
              const alt = tail.search(/["']\s*,/);
              if (alt >= 0) valueEnd = valueStart + alt;
            }
          }
          if (valueEnd >= 0) {
            gina =
              gina.slice(0, abs) +
              `description: '${CLEAN_DESC.replace(/'/g, "\\'")}'` +
              gina.slice(valueEnd + 1);
            console.log("Hardened get_pipeline_summary description");
          }
        }
      }
    }
  }

  // Soft guard in system-ish strings
  if (!/NEVER invent totals/.test(gina) && /pipeline summary/i.test(gina)) {
    gina = gina.replace(
      /(When Kimberley asks for a pipeline summary[^\n]*)/,
      `$1 LIVE Board counts only — if Board is empty report New: 0; NEVER invent New: 64 or emoji markdown tables.`,
    );
  }

  fs.writeFileSync(ginaJs, gina, "utf8");
  const check = spawnSync(process.execPath, ["--check", ginaJs], {
    encoding: "utf8",
  });
  if (check.status !== 0) {
    console.error("gina.js --check failed; restoring");
    fs.copyFileSync(gbak, ginaJs);
  } else {
    console.log("gina.js OK");
  }
}

// Refresh team prompt into gina.js if patcher exists
const teamPatch = path.join(__dirname, "patch-gina-team-commands.mjs");
if (fs.existsSync(teamPatch)) {
  const r = spawnSync(process.execPath, [teamPatch, ginaDir], {
    encoding: "utf8",
  });
  if (r.status === 0) console.log("Refreshed Gina team prompt rule");
  else if (r.stdout) console.log(r.stdout.slice(0, 400));
}

console.log(`
Next:
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend
  git add gina-backend/frontend/src/App.jsx gina-backend/gina.js gina-backend/lib/live-stage-counts.js gina-backend/briefing gina-backend/routes/pipeline-briefing.js gina-backend/GINA_TEAM_PROMPT_RULE.txt
  git commit -m "Pipeline summary uses live Board counts only (no invented New: 64)"
  git pull origin main --rebase
  git push origin main

Then ask Gina again: "Give me the pipeline summary"
Expect New: 0 (or real Board count) — not a July 30 emoji table with 64.
`);
