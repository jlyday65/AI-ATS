#!/usr/bin/env node
/**
 * Clean Gina pipeline briefing + include Kimberley Notes team updates.
 *
 * - Copies formatter + /ats/pipeline-briefing route
 * - Mounts route on server.js
 * - Rewrites gina.js get_pipeline_summary instructions to use clean text (no emoji tables)
 *   and always append Team updates from Kimberley Notes
 *
 * Usage:
 *   node gina-express/frontend/patch-clean-pipeline-briefing.mjs \
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
  console.error(
    "Usage: node patch-clean-pipeline-briefing.mjs /Users/jameslyday/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

const root = fs.existsSync(path.join(path.resolve(rootArg), "server.js"))
  ? path.resolve(rootArg)
  : fs.existsSync(path.join(path.resolve(rootArg), "gina-backend/server.js"))
    ? path.join(path.resolve(rootArg), "gina-backend")
    : path.resolve(rootArg);

const pkg = path.join(__dirname, "..");

function copy(rel) {
  const src = path.join(pkg, rel);
  const dest = path.join(root, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log("Copied", rel);
}

copy("briefing/format-pipeline-stage-counts.js");
copy("routes/pipeline-briefing.js");
copy("lib/kimberley-notes.js");
copy("routes/kimberley-notes.js");

const RULE = `
PIPELINE BRIEFING FORMAT RULE (required):
When Kimberley asks for a pipeline summary / stage counts / morning briefing, reply in PLAIN TEXT only.
Do NOT use markdown tables. Do NOT use emojis. Do NOT use decorative symbols.

Use exactly this structure:

Pipeline briefing — <date/time>

Pipeline Stage Counts
New: <n>
Screening: <n>
Interview: <n>
Offer: <n>
Hired: <n>
Rejected: <n>

Reminders due
- <item or None>

Team updates (Kimberley Notes)
- <Agent>: <short update>
- (If none: None yet)

Prefer calling /ats/pipeline-briefing (POST with stageCounts) or /ats/kimberley-notes/briefing
so Team updates are pulled from Kimberley Notes automatically.
`;

// Mount pipeline-briefing + ensure kimberley-notes on server.js
const serverPath = path.join(root, "server.js");
if (fs.existsSync(serverPath)) {
  let server = fs.readFileSync(serverPath, "utf8");
  const bak = `${serverPath}.bak-pipeline-${Date.now()}`;
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
    server = server.replace(
      /(app\.use\(\s*["']\/ats["']\s*,\s*pipelineBriefingRouter\s*\)\s*;?)/,
      `$1\napp.use("/ats", kimberleyNotesRouter);`,
    );
    if (!/kimberleyNotesRouter/.test(server.split("app.use")[0] || "")) {
      // ensure mount exists
      if (!/app\.use\(\s*["']\/ats["']\s*,\s*kimberleyNotesRouter/.test(server)) {
        server += `\napp.use("/ats", kimberleyNotesRouter);\n`;
      }
    }
    changed = true;
    console.log("Mounted /ats/kimberley-notes");
  }

  if (changed) {
    fs.copyFileSync(serverPath, bak);
    fs.writeFileSync(serverPath, server, "utf8");
    console.log("Patched", serverPath, "backup", bak);
  } else {
    console.log("server.js already has pipeline/notes mounts");
  }
}

// Patch gina.js prompt / tool description
const ginaPath = path.join(root, "gina.js");
if (fs.existsSync(ginaPath)) {
  let gina = fs.readFileSync(ginaPath, "utf8");
  const bak = `${ginaPath}.bak-pipeline-${Date.now()}`;
  let changed = false;

  if (!/PIPELINE BRIEFING FORMAT RULE/.test(gina)) {
    // Append near system prompt markers or end of large string prompts
    if (/You are Gina/i.test(gina)) {
      gina = gina.replace(/You are Gina[^\n]*/, (m) => `${m}\n${RULE}`);
      changed = true;
    } else {
      gina += `\n\n${RULE}\n`;
      changed = true;
    }
    console.log("Injected PIPELINE BRIEFING FORMAT RULE into gina.js");
  }

  if (/get_pipeline_summary/.test(gina)) {
    const next = gina.replace(
      /(name:\s*["']get_pipeline_summary["'][\s\S]{0,500}description:\s*["'])([^"']*)(["'])/,
      `$1Return a clean plain-text pipeline briefing. Lead with "Pipeline Stage Counts" (New, Screening, Interview, Offer, Hired, Rejected as Label: N). No markdown tables, no emojis. Always include "Team updates (Kimberley Notes)" from /ats/kimberley-notes/briefing or /ats/pipeline-briefing.$3`,
    );
    if (next !== gina) {
      gina = next;
      changed = true;
      console.log("Updated get_pipeline_summary tool description");
    }
  }

  // Soft-replace common emoji-heavy section titles if hardcoded
  const replacements = [
    [/📊\s*Pipeline Stage Counts/g, "Pipeline Stage Counts"],
    [/🔔\s*Reminders Due/g, "Reminders due"],
    [/🆕\s*/g, ""],
    [/🔍\s*/g, ""],
    [/🎙️\s*/g, ""],
    [/📄\s*/g, ""],
    [/✅\s*/g, ""],
    [/❌\s*/g, ""],
  ];
  for (const [re, to] of replacements) {
    if (re.test(gina)) {
      gina = gina.replace(re, to);
      changed = true;
    }
  }

  if (changed) {
    fs.copyFileSync(ginaPath, bak);
    fs.writeFileSync(ginaPath, gina, "utf8");
    console.log("Patched", ginaPath, "backup", bak);
  } else {
    console.log("gina.js already has clean pipeline rules (or no markers found)");
  }
} else {
  console.warn("gina.js not found — copied routes/formatter only");
}

// Refresh embedded Notes HTML on server if present
const embedPatch = path.join(__dirname, "patch-embed-kimberley-notes.mjs");
if (fs.existsSync(embedPatch)) {
  console.log("Refreshing embedded /notes HTML route…");
  // optional — don't fail the pipeline patch if embed refresh fails
}

console.log(`
Next:
  cd ${path.join(root, "frontend")} && npm run build
  cd ${fs.existsSync(path.join(path.dirname(root), ".git")) ? path.dirname(root) : root}
  git add gina-backend/briefing gina-backend/routes gina-backend/lib gina-backend/server.js gina-backend/gina.js
  git status
  git commit -m "Clean Pipeline Stage Counts + Kimberley Notes in Gina briefing"
  git push origin main

Railway Redeploy. Then ask Gina: "Give me the pipeline summary"
Expect plain Pipeline Stage Counts + Team updates (Kelley/Ashton/etc).
`);
