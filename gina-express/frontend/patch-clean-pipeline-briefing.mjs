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
PIPELINE OVERVIEW FORMAT RULE (required):
When Kimberley asks for a pipeline summary / overview / stage counts / morning briefing,
format it like Kimberley's Notes (NOT a dense one-line list, NOT markdown tables).

Emojis are OK. Use • bullets, blank lines, and full Team update blocks.

Prefer calling /ats/pipeline-briefing (POST with live boardCandidates + jobs)
and return that text as-is. Structure:

📋 Pipeline overview — <date/time> (live Board)

📊 Pipeline Stage Counts
• 🆕 New: <n>
• 🔍 Screening: <n>
• 🎙️ Interview: <n>
• 📄 Offer: <n>
• ✅ Hired: <n>
• ❌ Rejected: <n>
• Total on Board: <n>

📁 Jobs in pipeline

Job Title: <role>
• Names in Screening: <names or None>
• Names Interviewing: <names or None>
• Candidate Hired: <names or None>

⏰ Reminders due
• <item or None>

📝 Team updates (Kimberley Notes)

<Agent emoji> <Agent> (<Role>) — <time>
Ask: <task>

<full reply body from Kimberley's Notes, with • bullets>

———

(next agent update…)

Never invent New: 64. Never use markdown tables or Key Takeaways marketing copy.
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
    // Use single-quoted description — never nest " inside "
    const cleanDesc =
      "Return a Pipeline overview formatted like Kimberley's Notes (section headers, blank lines, • bullets, light emojis OK). Lead with live Board Pipeline Stage Counts, then Jobs in pipeline (Job Title, Names in Screening, Names Interviewing, Candidate Hired), then Reminders, then Team updates as Ask + full reply blocks from /ats/pipeline-briefing or /ats/kimberley-notes/briefing. No markdown tables, no Key Takeaways, never invent New: 64.";
    const next = gina.replace(
      /(name:\s*["']get_pipeline_summary["'][\s\S]{0,800}?description:\s*)(["'`])([\s\S]*?)\2/,
      `$1'${cleanDesc.replace(/'/g, "\\'")}'`,
    );
    if (next !== gina) {
      gina = next;
      changed = true;
      console.log("Updated get_pipeline_summary tool description");
    }
  }

  // Replace old "no emojis" instructions with Notes-style rule
  if (/Do NOT use emojis/i.test(gina) || /no emojis/i.test(gina)) {
    gina = gina.replace(/Do NOT use emojis\.?\s*/gi, "");
    gina = gina.replace(/,\s*no emojis/gi, ", emojis OK");
    gina = gina.replace(/no emojis/gi, "emojis OK");
    changed = true;
  }

  if (changed) {
    fs.copyFileSync(ginaPath, bak);
    fs.writeFileSync(ginaPath, gina, "utf8");
    console.log("Patched", ginaPath, "backup", bak);
  } else {
    console.log("gina.js already has Notes-style pipeline rules (or no markers found)");
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
  git commit -m "Pipeline overview formatted like Kimberley Notes"
  git push origin main

Railway Redeploy. Then ask Gina: "Give me the pipeline overview"
Expect Notes-style sections with • bullets, light emojis, and full Team updates.
`);
