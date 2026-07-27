#!/usr/bin/env node
/**
 * Wire Kimberley's Note Panel into Gina App.jsx + mount API routes.
 *
 * Usage:
 *   node /tmp/patch-kimberley-notes.mjs \
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
  console.error("Usage: node patch-kimberley-notes.mjs ~/lyday-gina-backend/gina-backend");
  process.exit(1);
}

const root = path.resolve(rootArg);
const appCandidates = [
  path.join(root, "frontend/src/App.jsx"),
  path.join(root, "gina-backend/frontend/src/App.jsx"),
  path.join(root, "App.jsx"),
];
const appPath = appCandidates.find((p) => fs.existsSync(p));
if (!appPath) {
  console.error("Could not find App.jsx under", root);
  process.exit(1);
}

const panelPath = path.join(__dirname, "KimberleyNotesPanel.jsx");
let panelSrc = fs.readFileSync(panelPath, "utf8");
// Extract the function body from the template string export
const m = panelSrc.match(/export const KIMBERLEY_NOTES_PANEL_SOURCE = `([\s\S]*?)`;/);
if (m) panelSrc = m[1];
else if (!panelSrc.includes("function KimberleyNotesPanel")) {
  console.error("KimberleyNotesPanel.jsx missing panel source");
  process.exit(1);
}

let app = fs.readFileSync(appPath, "utf8");
const bak = `${appPath}.bak-kimberley-${Date.now()}`;
fs.copyFileSync(appPath, bak);

if (!app.includes("function KimberleyNotesPanel")) {
  // Insert before export default / CandidateTracker return — after ResumeUploadPanel if present
  const anchor =
    app.indexOf("function ResumeUploadPanel") >= 0
      ? app.indexOf("function ResumeUploadPanel")
      : app.search(/function CandidateTracker|export default function|function App\b/);
  if (anchor < 0) {
    console.error("No insert anchor for KimberleyNotesPanel");
    process.exit(1);
  }
  app = app.slice(0, anchor) + "\n" + panelSrc + "\n" + app.slice(anchor);
  console.log("Inserted KimberleyNotesPanel function");
} else {
  console.log("KimberleyNotesPanel already present");
}

// Add nav tab if there is a tabs / views pattern
if (!/kimberley|Kimberley's Notes/i.test(app) || !/view === ["']kimberley["']/.test(app)) {
  // Try common nav arrays
  if (/\{[^}]*href:[^}]*label:[^}]*Agent/i.test(app) || /label:\s*["']Agent["']/.test(app)) {
    app = app.replace(
      /(label:\s*["']Agent["'][^}]*\})/,
      '$1,\n  { id: "kimberley", label: "Kimberley\'s Notes" }',
    );
  }
  // Render panel when view/tab selected
  if (!/KimberleyNotesPanel\s*\(/.test(app) || !/<KimberleyNotesPanel/.test(app)) {
    const renderSnippets = [
      /\{view === ["']agent["'][^}]*\}/,
      /\{tab === ["']agent["'][^}]*\}/,
      /\{activeView === ["']agent["'][^}]*\}/,
    ];
    let injected = false;
    for (const re of renderSnippets) {
      if (re.test(app)) {
        app = app.replace(
          re,
          (match) =>
            `${match}\n        {view === "kimberley" || tab === "kimberley" || activeView === "kimberley" ? <KimberleyNotesPanel /> : null}`,
        );
        injected = true;
        break;
      }
    }
    if (!injected) {
      // Fallback: add a clearly marked mount point comment near AgentPanel
      if (app.includes("AgentPanel") && !app.includes("<KimberleyNotesPanel")) {
        app = app.replace(
          /(<AgentPanel[\s\S]*?\/>)/,
          '$1\n        {/* Kimberley notes: set view to "kimberley" or render below */}\n        <KimberleyNotesPanel />',
        );
        console.log("Mounted KimberleyNotesPanel near AgentPanel (always visible fallback)");
      } else {
        console.warn(
          "Could not auto-wire nav — add view id \"kimberley\" and <KimberleyNotesPanel /> manually",
        );
      }
    } else {
      console.log("Wired kimberley view render");
    }
  }
}

fs.writeFileSync(appPath, app, "utf8");
console.log("Backup:", bak);
console.log("Patched:", appPath);

// Copy backend files into Gina root
function copyInto(srcRel, destRel) {
  const src = path.join(__dirname, "..", srcRel);
  const dest = path.join(root, destRel);
  if (!fs.existsSync(src)) {
    console.warn("Missing source", src);
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log("Copied", destRel);
}

const ginaRoot = fs.existsSync(path.join(root, "server.js"))
  ? root
  : fs.existsSync(path.join(root, "gina-backend/server.js"))
    ? path.join(root, "gina-backend")
    : root;

copyInto("lib/kimberley-notes.js", path.relative(root, path.join(ginaRoot, "lib/kimberley-notes.js")));
copyInto("routes/kimberley-notes.js", path.relative(root, path.join(ginaRoot, "routes/kimberley-notes.js")));
copyInto("agents/bot-replies.js", path.relative(root, path.join(ginaRoot, "agents/bot-replies.js")));
copyInto("agents/command-agent.tool.js", path.relative(root, path.join(ginaRoot, "agents/command-agent.tool.js")));
copyInto("routes/run-command.js", path.relative(root, path.join(ginaRoot, "routes/run-command.js")));
copyInto(
  "briefing/format-pipeline-stage-counts.js",
  path.relative(root, path.join(ginaRoot, "briefing/format-pipeline-stage-counts.js")),
);

// Patch server.js to mount router if possible
const serverPath = path.join(ginaRoot, "server.js");
if (fs.existsSync(serverPath)) {
  let server = fs.readFileSync(serverPath, "utf8");
  if (!/kimberley-notes/.test(server)) {
    const importLine =
      'import kimberleyNotesRouter from "./routes/kimberley-notes.js";\n';
    if (/import runCommandRouter/.test(server)) {
      server = server.replace(
        /import runCommandRouter.*/,
        (m) => `${m}\n${importLine.trim()}`,
      );
    } else if (/^import /m.test(server)) {
      server = importLine + server;
    }
    if (/app\.use\(\s*["']\/ats["']/.test(server)) {
      server = server.replace(
        /app\.use\(\s*["']\/ats["']\s*,\s*runCommandRouter\s*\)/,
        'app.use("/ats", runCommandRouter);\napp.use("/ats", kimberleyNotesRouter)',
      );
      if (!/kimberleyNotesRouter/.test(server.split("app.use")[1] || "")) {
        server = server.replace(
          /(app\.use\(\s*["']\/ats["'][^)]*\))/,
          '$1\napp.use("/ats", kimberleyNotesRouter)',
        );
      }
    } else {
      server += `\napp.use("/ats", kimberleyNotesRouter);\n`;
    }
    fs.writeFileSync(serverPath, server, "utf8");
    console.log("Mounted kimberleyNotesRouter in server.js");
  } else {
    console.log("server.js already mentions kimberley-notes");
  }
}

console.log(`
Next:
  cd ${path.join(ginaRoot, "frontend")} && npm run build
  cd ${ginaRoot}
  # optional Postgres:
  # psql $DATABASE_URL -c "CREATE TABLE IF NOT EXISTS kimberley_notes (id SERIAL PRIMARY KEY, from_agent TEXT NOT NULL, agent_role TEXT, task TEXT NOT NULL, reply TEXT NOT NULL, action_id TEXT, requested_by TEXT DEFAULT 'Kimberley', status TEXT DEFAULT 'unread', include_in_briefing BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW());"
  git add -A
  git commit -m "Add Kimberley's Note Panel for team bot replies"
  git push origin main
`);
