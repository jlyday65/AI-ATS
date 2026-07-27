#!/usr/bin/env node
/**
 * Wire Kimberley's Note Panel into Gina App.jsx + mount API routes.
 *
 * IMPORTANT: KimberleyNotesPanel must be a SIBLING of AgentPanel, never injected
 * into the <AgentPanel ...> props (that breaks Vite/esbuild JSX).
 *
 * Usage:
 *   node gina-express/frontend/patch-kimberley-notes.mjs \
 *     ~/lyday-gina-backend/gina-backend
 *
 * If App.jsx is already broken, run repair-kimberley-notes-jsx.mjs first.
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

const panelPath = path.join(__dirname, "KimberleyNotesPanel.snippet.jsx");
if (!fs.existsSync(panelPath)) {
  console.error("Missing", panelPath);
  process.exit(1);
}
const panelSrc = fs.readFileSync(panelPath, "utf8").trim() + "\n";

let app = fs.readFileSync(appPath, "utf8");

// Auto-repair nested inject before continuing
if (
  /<AgentPanel\b[\s\S]{0,300}\{\s*view\s*===\s*["']kimberley["']/.test(app) ||
  /view === "kimberley" \|\| tab === "kimberley"/.test(app)
) {
  const exactRe =
    /\{\s*view\s*===\s*"agent"\s*&&\s*<AgentPanel\b([^>\n]*)\n\s*\{\s*view\s*===\s*"kimberley"\s*\|\|\s*tab\s*===\s*"kimberley"\s*\|\|\s*activeView\s*===\s*"kimberley"\s*\?\s*<KimberleyNotesPanel\s*\/>\s*:\s*null\s*\}\s*\/>\s*\}/g;
  if (exactRe.test(app)) {
    app = app.replace(exactRe, (_, props) => {
      const p = String(props || "").trim();
      return `{view === "agent" && <AgentPanel ${p} />}\n        {view === "kimberley" && <KimberleyNotesPanel />}`;
    });
    console.log("Auto-repaired nested Kimberley inject inside AgentPanel");
  }
}

const bak = `${appPath}.bak-kimberley-${Date.now()}`;
fs.copyFileSync(appPath, bak);

if (app.includes("function KimberleyNotesPanel")) {
  // Replace existing (possibly broken/escaped) panel with clean snippet
  const panelStart = app.search(/function\s+KimberleyNotesPanel\s*\(/);
  const after = app.slice(panelStart + 1);
  const endRel = after.search(
    /\nfunction\s+(ResumeUploadPanel|CandidateTracker|AgentPanel|MariaView|App|GinaBriefingCard)\b/,
  );
  if (panelStart >= 0 && endRel >= 0) {
    const end = panelStart + 1 + endRel;
    app = app.slice(0, panelStart) + panelSrc + "\n" + app.slice(end);
    console.log("Replaced existing KimberleyNotesPanel with clean snippet");
  } else {
    console.log("KimberleyNotesPanel already present (could not bound replace)");
  }
} else {
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
}

if (!/id:\s*["']kimberley["']/.test(app) && /label:\s*["']Agent["']/.test(app)) {
  app = app.replace(
    /(label:\s*["']Agent["'][^}]*\})/,
    '$1,\n  { id: "kimberley", label: "Kimberley\'s Notes" }',
  );
  console.log("Added kimberley nav id next to Agent");
}

const KIMBERLEY_VIEW = '{view === "kimberley" && <KimberleyNotesPanel />}';

if (
  /function KimberleyNotesPanel/.test(app) &&
  !/\{\s*view\s*===\s*["']kimberley["']\s*&&\s*<KimberleyNotesPanel/.test(app)
) {
  const agentClosed =
    /(\{\s*view\s*===\s*["']agent["']\s*&&\s*<AgentPanel\b[\s\S]*?\/>\s*\})/;
  if (agentClosed.test(app)) {
    app = app.replace(agentClosed, (block) => `${block}\n        ${KIMBERLEY_VIEW}`);
    console.log("Wired kimberley view after closed AgentPanel block");
  } else if (/\{view === "maria" &&/.test(app)) {
    app = app.replace(
      /(\{\s*view\s*===\s*["']maria["']\s*&&)/,
      `${KIMBERLEY_VIEW}\n\n        $1`,
    );
    console.log("Wired kimberley view before Maria view");
  } else {
    console.warn(
      'Add manually after Agent panel: {view === "kimberley" && <KimberleyNotesPanel />}',
    );
  }
}

if (/<AgentPanel\b[\s\S]{0,200}\{\s*view\s*===\s*["']kimberley["']/.test(app)) {
  console.error(
    "REFUSING TO WRITE: Kimberley inject still nested inside AgentPanel. Run repair-kimberley-notes-jsx.mjs",
  );
  process.exit(2);
}

fs.writeFileSync(appPath, app, "utf8");
console.log("Backup:", bak);
console.log("Patched:", appPath);

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
        /(app\.use\(\s*["']\/ats["'][^)]*\))/,
        '$1\napp.use("/ats", kimberleyNotesRouter)',
      );
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
  git add -A
  git commit -m "Add Kimberley's Note Panel for team bot replies"
  git push origin main
`);
