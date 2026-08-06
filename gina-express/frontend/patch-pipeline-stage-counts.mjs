#!/usr/bin/env node
/**
 * Reformat Gina pipeline summary / morning briefing around "Pipeline Stage Counts"
 * and include Kimberley team updates.
 *
 * Usage:
 *   node /tmp/patch-pipeline-stage-counts.mjs \
 *     /Users/jameslyday/lyday-gina-backend/gina-backend
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootArg = String(process.argv[2] || "")
  .replace(/^~/, process.env.HOME || "")
  .trim();
if (!rootArg) {
  console.error("Usage: node patch-pipeline-stage-counts.mjs ~/lyday-gina-backend/gina-backend");
  process.exit(1);
}

const root = fs.existsSync(path.join(path.resolve(rootArg), "server.js"))
  ? path.resolve(rootArg)
  : fs.existsSync(path.join(path.resolve(rootArg), "gina-backend/server.js"))
    ? path.join(path.resolve(rootArg), "gina-backend")
    : path.resolve(rootArg);

const formatterSrc = path.join(__dirname, "../briefing/format-pipeline-stage-counts.js");
const formatterDest = path.join(root, "briefing/format-pipeline-stage-counts.js");
fs.mkdirSync(path.dirname(formatterDest), { recursive: true });
fs.copyFileSync(formatterSrc, formatterDest);
console.log("Copied briefing/format-pipeline-stage-counts.js");

const HELPER = `
/** Pipeline Stage Counts — morning briefing formatter */
function formatPipelineStageCountsLocal(stageCounts = {}) {
  const order = [
    ["new", "New"],
    ["screening", "Screening"],
    ["interview", "Interview"],
    ["offer", "Offer"],
    ["hired", "Hired"],
    ["rejected", "Rejected"],
  ];
  const lines = ["Pipeline Stage Counts"];
  for (const [key, label] of order) {
    lines.push(label + ": " + (Number(stageCounts[key]) || 0));
  }
  return lines.join("\\n");
}
`;

// Patch App.jsx GinaBriefingCard / sendDailySummary if present
const appPath = [
  path.join(root, "frontend/src/App.jsx"),
  path.join(root, "App.jsx"),
].find((p) => fs.existsSync(p));

if (appPath) {
  let app = fs.readFileSync(appPath, "utf8");
  const bak = `${appPath}.bak-briefing-${Date.now()}`;
  fs.copyFileSync(appPath, bak);

  if (!/Pipeline Stage Counts/.test(app)) {
    if (!/formatPipelineStageCountsLocal/.test(app)) {
      const insertAt = app.search(/function GinaBriefingCard|async function sendDailySummary|function sendDailySummary/);
      if (insertAt >= 0) {
        app = app.slice(0, insertAt) + HELPER + "\n" + app.slice(insertAt);
      }
    }

    // Prefer replacing any "stageCounts" JSON stringify usage in summary body
    if (/stageCounts/.test(app) && /sendDailySummary|GinaBriefingCard/.test(app)) {
      // Inject teamUpdates fetch + labeled text field on summary payload
      if (!/teamUpdates/.test(app)) {
        app = app.replace(
          /(const summary = \{[^}]*stageCounts[^}]*\})/s,
          (block) => {
            if (/teamUpdates/.test(block)) return block;
            return block.replace(
              /\};?\s*$/,
              `,
    pipelineStageCountsText: formatPipelineStageCountsLocal(stageCounts),
    teamUpdates: (typeof window !== "undefined" ? [] : []),
  };`,
            );
          },
        );
      }

      // Before POST, fetch kimberley notes briefing
      if (/fetch\([^)]*\/ats\/summary/.test(app) && !/kimberley-notes\/briefing/.test(app)) {
        app = app.replace(
          /(const summary = \{[\s\S]*?\};)/,
          `$1
      try {
        const notesRes = await fetch("/ats/kimberley-notes/briefing", { credentials: "include" });
        const notesJson = await notesRes.json().catch(() => ({}));
        if (notesRes.ok && Array.isArray(notesJson.teamUpdates)) {
          summary.teamUpdates = notesJson.teamUpdates;
        }
      } catch (_) {}
      summary.pipelineStageCountsText = formatPipelineStageCountsLocal(summary.stageCounts || stageCounts);
`,
        );
        console.log("Injected Kimberley notes into pipeline summary payload");
      }

      // Soften button label if present
      app = app.replace(
        /Send today's pipeline summary to Gina/g,
        "Send Pipeline Stage Counts to Gina",
      );
    }
    fs.writeFileSync(appPath, app, "utf8");
    console.log("Patched App.jsx briefing card:", appPath);
    console.log("Backup:", bak);
  } else {
    console.log("App.jsx already mentions Pipeline Stage Counts");
  }
} else {
  console.warn("App.jsx not found — formatter copied only");
}

// Patch briefing.js if present
const briefingPath = path.join(root, "briefing.js");
if (fs.existsSync(briefingPath)) {
  let briefing = fs.readFileSync(briefingPath, "utf8");
  const bak = `${briefingPath}.bak-briefing-${Date.now()}`;
  fs.copyFileSync(briefingPath, bak);
  if (!/Pipeline Stage Counts/.test(briefing)) {
    if (!/format-pipeline-stage-counts/.test(briefing)) {
      briefing =
        'import { formatMorningPipelineBriefing, formatPipelineStageCounts } from "./briefing/format-pipeline-stage-counts.js";\n' +
        briefing;
    }
    // Try to wrap return text of runMorningBriefing
    if (/stage_counts|stageCounts/.test(briefing) && !/formatPipelineStageCounts\(/.test(briefing)) {
      briefing = briefing.replace(
        /(stageCounts|stage_counts)/,
        (m) => m,
      );
      // Append helper comment for manual wiring
      briefing += `

/** Prefer for morning email/chat body:
 *  formatMorningPipelineBriefing({
 *    stageCounts: row.stage_counts || row.stageCounts,
 *    remindersDue: row.reminders_due || [],
 *    pipelineDetail: row.pipeline_detail || [],
 *    teamUpdates: row.team_updates || row.teamUpdates || [],
 *    asOf: row.as_of || row.asOf,
 *  })
 *  First section title MUST read: "Pipeline Stage Counts"
 */
`;
      console.log("Annotated briefing.js — wire formatMorningPipelineBriefing into runMorningBriefing return");
    }
    fs.writeFileSync(briefingPath, briefing, "utf8");
    console.log("Backup:", bak);
  } else {
    console.log("briefing.js already mentions Pipeline Stage Counts");
  }
}

// Patch gina.js get_pipeline_summary tool response formatting if found
const ginaJs = path.join(root, "gina.js");
if (fs.existsSync(ginaJs)) {
  let gina = fs.readFileSync(ginaJs, "utf8");
  if (/get_pipeline_summary/.test(gina) && !/Pipeline Stage Counts/.test(gina)) {
    const bak = `${ginaJs}.bak-briefing-${Date.now()}`;
    fs.copyFileSync(ginaJs, bak);
    gina = gina.replace(
      /get_pipeline_summary/g,
      "get_pipeline_summary",
    );
    // Inject instruction near tool description
    gina = gina.replace(
      /(name:\s*["']get_pipeline_summary["'][\s\S]{0,400}description:\s*["'])([^"']*)(["'])/,
      `$1$2 Always lead with a section titled Pipeline Stage Counts (New, Screening, Interview, Offer, Hired, Rejected), then reminders, active pipeline, and Kimberley team updates.$3`,
    );
    fs.writeFileSync(ginaJs, gina, "utf8");
    console.log("Updated get_pipeline_summary description in gina.js");
    console.log("Backup:", bak);
  }
}

console.log(`
Next:
  cd ${path.join(root, "frontend")} && npm run build
  cd ${root}
  git add frontend/src/App.jsx briefing.js briefing/ gina.js
  git commit -m "Reformat morning briefing as Pipeline Stage Counts + team updates"
  git push origin main
`);
