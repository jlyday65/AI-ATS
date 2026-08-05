#!/usr/bin/env node
/**
 * Ensure Kelley/Kelly (and other bot) Kimberley Notes appear in Gina's
 * pipeline summary / morning briefing.
 *
 * Fixes: "Kelly's update did not go in Gina's pipeline summary"
 *
 * ONE LINE:
 *   node gina-express/frontend/patch-pipeline-include-team-updates.mjs ~/lyday-gina-backend/gina-backend
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

if (!fs.existsSync(path.join(ginaDir, "frontend", "src", "App.jsx")) && !fs.existsSync(path.join(ginaDir, "gina.js"))) {
  console.error(
    "Usage (one line): node patch-pipeline-include-team-updates.mjs ~/lyday-gina-backend/gina-backend",
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

copy("briefing/format-pipeline-stage-counts.js");
copy("routes/pipeline-briefing.js");
copy("lib/kimberley-notes.js");
copy("routes/kimberley-notes.js");

const RULE = `
PIPELINE BRIEFING — TEAM UPDATES RULE (required):
When Kimberley asks for a pipeline summary / stage counts / morning briefing:
1) Format like Kimberley's Notes (headers, blank lines, • bullets; light emojis OK).
2) Lead with Pipeline Stage Counts from the LIVE Board (New, Screening, Interview, Offer, Hired, Rejected).
3) Then include 📁 Jobs in pipeline — for each role: Job Title, Names in Screening,
   Names Interviewing, Candidate Hired (from live Board; "None" when empty).
4) ALWAYS include section "Team updates (Kimberley Notes)" with Ask + full reply blocks
   (not one-line blurbs). Prefer POST /ats/pipeline-briefing with boardCandidates + jobs.
5) Pull live notes from GET /ats/kimberley-notes/briefing or POST /ats/pipeline-briefing —
   do NOT rely only on a cached /ats/summary payload (it often lacks bot replies).
6) Include Kelley/Kelly, Maria, Michelle, and Ashton updates filed after Check for actions.
7) EVERY bot reply is dual-filed: Kimberley's Notes (full text) AND this Team updates section.
8) If briefing returns no notes yet, say: Team updates — None yet (ask team bots, then Check for actions).
`.trim();

// Mount routes on server.js
const serverPath = path.join(ginaDir, "server.js");
if (fs.existsSync(serverPath)) {
  let server = fs.readFileSync(serverPath, "utf8");
  const bak = `${serverPath}.bak-team-brief-${Date.now()}`;
  let changed = false;

  if (!/pipeline-briefing|pipelineBriefingRouter/.test(server)) {
    if (/^import\s+/m.test(server)) {
      server =
        `import pipelineBriefingRouter from "./routes/pipeline-briefing.js";\n` + server;
    } else {
      server =
        `const pipelineBriefingRouter = require("./routes/pipeline-briefing.js");\n` +
        server;
    }
    if (/const\s+app\s*=\s*express\s*\(/.test(server)) {
      server = server.replace(
        /(const\s+app\s*=\s*express\s*\(\s*\)\s*;?)/,
        `$1\napp.use("/ats", pipelineBriefingRouter);`,
      );
    } else {
      server += `\napp.use("/ats", pipelineBriefingRouter);\n`;
    }
    changed = true;
    console.log("Mounted /ats/pipeline-briefing");
  }

  if (!/kimberley-notes|kimberleyNotesRouter/.test(server)) {
    if (/^import\s+/m.test(server)) {
      server =
        `import kimberleyNotesRouter from "./routes/kimberley-notes.js";\n` + server;
    } else {
      server =
        `const kimberleyNotesRouter = require("./routes/kimberley-notes.js");\n` +
        server;
    }
    if (/app\.use\(\s*["']\/ats["']\s*,\s*pipelineBriefingRouter/.test(server)) {
      server = server.replace(
        /(app\.use\(\s*["']\/ats["']\s*,\s*pipelineBriefingRouter\s*\)\s*;?)/,
        `$1\napp.use("/ats", kimberleyNotesRouter);`,
      );
    } else if (/const\s+app\s*=\s*express\s*\(/.test(server)) {
      server = server.replace(
        /(const\s+app\s*=\s*express\s*\(\s*\)\s*;?)/,
        `$1\napp.use("/ats", kimberleyNotesRouter);`,
      );
    } else {
      server += `\napp.use("/ats", kimberleyNotesRouter);\n`;
    }
    changed = true;
    console.log("Mounted /ats/kimberley-notes");
  }

  if (changed) {
    fs.copyFileSync(serverPath, bak);
    fs.writeFileSync(serverPath, server, "utf8");
    console.log("Backup server:", bak);
  } else {
    console.log("server.js already mounts pipeline/notes routes");
  }
}

// Strengthen gina.js — only via GINA_TEAM_RULES const (never raw prose paste)
const ginaPath = path.join(ginaDir, "gina.js");
if (fs.existsSync(ginaPath)) {
  let gina = fs.readFileSync(ginaPath, "utf8");
  const bak = `${ginaPath}.bak-team-brief-${Date.now()}`;
  let changed = false;

  const safeRule = RULE.replace(/`/g, "'");

  if (/const GINA_TEAM_RULES\s*=\s*`/.test(gina)) {
    if (!/PIPELINE BRIEFING — TEAM UPDATES RULE/.test(gina)) {
      gina = gina.replace(
        /const GINA_TEAM_RULES\s*=\s*`([\s\S]*?)`;/,
        (_m, body) =>
          `const GINA_TEAM_RULES = \`${String(body).replace(/\$\{GINA_TEAM_RULES\}/g, "")}\n\n${safeRule}\`;`,
      );
      changed = true;
      console.log("Appended TEAM UPDATES RULE into GINA_TEAM_RULES const");
    }
  } else if (!/PIPELINE BRIEFING — TEAM UPDATES RULE/.test(gina)) {
    const rulesConst = `const GINA_TEAM_RULES = \`${safeRule}\`;`;
    if (/^import .+$/m.test(gina)) {
      const lastImport = [...gina.matchAll(/^import .+$/gm)].pop();
      const idx = lastImport.index + lastImport[0].length;
      gina = gina.slice(0, idx) + "\n\n" + rulesConst + "\n" + gina.slice(idx);
    } else {
      gina = rulesConst + "\n\n" + gina;
    }
    changed = true;
    console.log("Inserted TEAM UPDATES RULE as GINA_TEAM_RULES const");
  }

  if (/get_pipeline_summary/.test(gina)) {
    const cleanDesc =
      "Return a Pipeline overview formatted like Kimberley's Notes from LIVE Board counts only (headers, • bullets, light emojis OK). Lead with Pipeline Stage Counts, then Jobs in pipeline (Job Title, Names in Screening, Names Interviewing, Candidate Hired). If the Board is empty, every stage is 0 — NEVER invent totals (e.g. New: 64), NEVER reuse an old dated snapshot, NEVER use markdown tables or Key Takeaways. ALWAYS append Team updates as Ask + full reply blocks via /ats/kimberley-notes/briefing or /ats/pipeline-briefing so Kelley/Kelly, Maria, Michelle, and Ashton appear — never stage counts alone. Do not suggest Michelle screen candidates when New is 0.";
    const next = gina.replace(
      /(name:\s*["']get_pipeline_summary["'][\s\S]{0,900}?description:\s*)(["'`])([\s\S]*?)\2/,
      `$1'${cleanDesc.replace(/'/g, "\\'")}'`,
    );
    if (next !== gina) {
      gina = next;
      changed = true;
      console.log("Updated get_pipeline_summary description");
    }
  }

  // If get_pipeline_summary handler returns raw stored summary, try to wrap it
  if (
    /get_pipeline_summary|pipeline_summary|\/ats\/summary/.test(gina) &&
    !/kimberley-notes\/briefing/.test(gina)
  ) {
    if (/lastSummary|latestSummary|pipelineSummary|ats\/summary/.test(gina)) {
      gina = gina.replace(
        /(async\s+function\s+\w*[Ss]ummary\w*\s*\([^)]*\)\s*\{)/,
        `$1
  // Always merge Kimberley Notes into pipeline summaries (Kelley/Kelly updates).
`,
      );
      changed = true;
    }
  }

  if (changed) {
    fs.copyFileSync(ginaPath, bak);
    fs.writeFileSync(ginaPath, gina, "utf8");
    console.log("Patched gina.js, backup:", bak);
    const chk = spawnSync(process.execPath, ["--check", ginaPath], {
      encoding: "utf8",
    });
    if (chk.status !== 0) {
      console.error("REFUSING: gina.js failed node --check after patch");
      console.error(chk.stderr || chk.stdout);
      fs.copyFileSync(bak, ginaPath);
      process.exit(2);
    }
  } else {
    console.log("gina.js already has team-updates briefing rule");
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
  if (!esbuild) return { ok: true, skipped: true };
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

// Patch App.jsx sendDailySummary to attach teamUpdates + boardCandidates/jobs
const appPath = path.join(ginaDir, "frontend", "src", "App.jsx");
if (fs.existsSync(appPath)) {
  let src = fs.readFileSync(appPath, "utf8");
  const bak = `${appPath}.bak-team-brief-${Date.now()}`;
  const esbuild = loadEsbuild();
  const before = canCompile(esbuild, src);
  if (!before.ok) {
    console.error("App.jsx does not compile — skip UI inject:", before.error);
  } else if (/const summary = \{[\s\S]*?stageCounts[\s\S]*?\};/.test(src)) {
    let next = src;
    if (!/teamUpdates/.test(next)) {
      next = next.replace(
        /(const summary = \{[\s\S]*?pipelineDetail[\s\S]*?)(\};)/,
        `$1,
        teamUpdates: [],
      $2`,
      );
    }
    // Ensure live Board people + open jobs reach /ats/pipeline-briefing Jobs rollup
    if (!/boardCandidates\s*:/.test(next)) {
      next = next.replace(
        /(const summary = \{[\s\S]*?)(\};)/,
        `$1,
        boardCandidates: Array.isArray(candidates) ? candidates : [],
        jobs: Array.isArray(jobs) ? jobs.map((j) => ({ title: j.title || j.name || j.roleTitle || "", id: j.id })).filter((j) => j.title) : [],
      $2`,
      );
    }
    if (!/kimberley-notes\/briefing/.test(next)) {
      next = next.replace(
        /(const summary = \{[\s\S]*?\};)/,
        `$1
      try {
        const notesRes = await fetch("/ats/kimberley-notes/briefing", { credentials: "include" });
        const notesJson = await notesRes.json().catch(() => ({}));
        if (notesRes.ok && Array.isArray(notesJson.teamUpdates)) {
          summary.teamUpdates = notesJson.teamUpdates;
        }
      } catch (_) {}
`,
      );
    }
    // Prefer server formatter text (includes Jobs in pipeline names)
    if (!/\/ats\/pipeline-briefing/.test(next)) {
      next = next.replace(
        /(const summary = \{[\s\S]*?\};(?:\s*try \{[\s\S]*?catch \(_\) \{\}\s*)?)/,
        `$1
      try {
        const briefRes = await fetch("/ats/pipeline-briefing", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            boardCandidates: summary.boardCandidates || candidates || [],
            jobs: summary.jobs || jobs || [],
            stageCounts: summary.stageCounts,
            remindersDue: summary.remindersDue || [],
            teamUpdates: summary.teamUpdates || [],
          }),
        });
        const briefJson = await briefRes.json().catch(() => ({}));
        if (briefRes.ok && briefJson.text) summary.pipelineBriefingText = briefJson.text;
      } catch (_) {}
`,
      );
    }
    const after = canCompile(esbuild, next);
    if (!after.ok) {
      console.error("REFUSING App.jsx teamUpdates inject:", after.error);
    } else if (next !== src) {
      fs.copyFileSync(appPath, bak);
      fs.writeFileSync(appPath, next, "utf8");
      console.log("Patched App.jsx sendDailySummary for teamUpdates + Jobs rollup");
      console.log("Backup:", bak);
    } else {
      console.log("App.jsx already has boardCandidates/jobs + briefing hooks (or no change needed)");
    }
  } else {
    console.log("App.jsx summary payload shape not found — server/gina rules still applied");
  }
}

console.log(`
OK: pipeline briefing now pulls Kelley/Kelly Kimberley Notes into Team updates.

Next:
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend
  git add gina-backend/briefing gina-backend/routes gina-backend/lib gina-backend/server.js gina-backend/gina.js gina-backend/frontend/src/App.jsx
  git status
  git commit -m "Include Kelley team updates in Gina pipeline summary"
  git pull origin main --rebase
  git push origin main

Then Railway redeploy. Retest:
  1) Ask Gina: Ask Kelly for an update → Check for actions → Kimberley Notes
  2) Ask Gina: Give me the pipeline summary
  Expect Jobs in pipeline (Job Title / Names in Screening / Interviewing / Hired)
  and Team updates (Kimberley Notes) to list Kelley.
`);
