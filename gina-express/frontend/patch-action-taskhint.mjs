#!/usr/bin/env node
/**
 * 1) Patch App.jsx so /ats/run-command receives a taskHint built from the
 *    entire queued action (payload is often empty aside from assignedTo).
 * 2) Refresh routes/run-command.js + maria-source.tool.js from GitHub.
 *
 * Usage (one line at a time — no && \):
 *   curl -fsSL "https://raw.githubusercontent.com/jlyday65/AI-ATS/cursor/ai-ats-b2b-platform-4f1f/gina-express/frontend/patch-action-taskhint.mjs" -o /tmp/patch-action-taskhint.mjs
 *   node /tmp/patch-action-taskhint.mjs /Users/jameslyday/lyday-gina-backend/gina-backend
 */

import fs from "fs";
import path from "path";
import https from "https";

const root = path.resolve(
  String(process.argv[2] || "").replace(/^~/, process.env.HOME || ""),
);
const ginaDir = fs.existsSync(path.join(root, "server.js"))
  ? root
  : path.join(root, "gina-backend");

const RAW =
  "https://raw.githubusercontent.com/jlyday65/AI-ATS/cursor/ai-ats-b2b-platform-4f1f/gina-express";

function download(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          download(res.headers.location).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`${url} → ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      })
      .on("error", reject);
  });
}

const appPath = path.join(ginaDir, "frontend", "src", "App.jsx");
if (!fs.existsSync(appPath)) {
  console.error("Missing", appPath);
  process.exit(1);
}

let app = fs.readFileSync(appPath, "utf8");
const bak = `${appPath}.bak-hint-${Date.now()}`;
fs.copyFileSync(appPath, bak);

const NEW_FETCH_BLOCK = `const res = await fetch("/ats/run-command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            type,
            actionId: action.id,
            payload: payload || {},
            action,
            summary: action.summary || action.detail || action.notes || "",
            taskHint: [
              action.summary,
              action.detail,
              action.notes,
              action.description,
              action.task,
              typeof action.payload === "string"
                ? action.payload
                : JSON.stringify(action.payload || {}),
              typeof payload === "string" ? payload : JSON.stringify(payload || {}),
            ]
              .filter(Boolean)
              .join("\\n"),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) {
          const dbg = data.debug ? \` | debug: \${JSON.stringify(data.debug)}\` : "";
          return {
            ok: false,
            reason: (data.error || data.reason || \`Command failed (\${res.status})\`) + dbg,
          };
        }`;

// Replace the first /ats/run-command fetch block for command types
const re =
  /const res = await fetch\("\/ats\/run-command",\s*\{[\s\S]*?\}\);\s*const data = await res\.json\(\)\.catch\(\(\) => \(\{\}\)\);\s*if \(!res\.ok \|\| data\.ok === false\) \{\s*return \{\s*ok: false,\s*reason: data\.error \|\| data\.reason \|\| `Command failed \(\$\{res\.status\}\)`,\s*\};\s*\}/;

if (/taskHint:/.test(app)) {
  console.log("App.jsx already has taskHint");
} else if (re.test(app)) {
  app = app.replace(re, NEW_FETCH_BLOCK);
  fs.writeFileSync(appPath, app, "utf8");
  console.log("Patched App.jsx with taskHint");
} else {
  // looser: inject taskHint into existing stringify if present
  if (
    app.includes('fetch("/ats/run-command"') &&
    app.includes("payload: payload || {}")
  ) {
    app = app.replace(
      /payload:\s*payload\s*\|\|\s*\{\},?/g,
      `payload: payload || {},
            taskHint: [
              action.summary,
              action.detail,
              action.notes,
              action.description,
              action.task,
              typeof action.payload === "string" ? action.payload : JSON.stringify(action.payload || {}),
            ].filter(Boolean).join("\\n"),`,
    );
    fs.writeFileSync(appPath, app, "utf8");
    console.log("Patched App.jsx payload blocks with taskHint (loose)");
  } else {
    console.warn("Could not patch App.jsx automatically — server files will still update.");
  }
}

for (const rel of ["maria-source.tool.js", "routes/run-command.js"]) {
  const dest = path.join(ginaDir, rel);
  const body = await download(`${RAW}/${rel}`);
  fs.writeFileSync(dest, body, "utf8");
  console.log("Wrote", dest);
}

// Strengthen gina.js tool guidance if present
const ginaJs = path.join(ginaDir, "gina.js");
if (fs.existsSync(ginaJs)) {
  let g = fs.readFileSync(ginaJs, "utf8");
  const must =
    'REQUIRED payload fields for source_candidates_signalhire: roleTitle (string), location (string), task (full instruction), resumesRequired (boolean). Example roleTitle: "Warehouse Assistant Manager".';
  if (!g.includes("REQUIRED payload fields for source_candidates_signalhire")) {
    const bakG = `${ginaJs}.bak-hint-${Date.now()}`;
    fs.copyFileSync(ginaJs, bakG);
    if (/source_candidates_signalhire/.test(g)) {
      g = g.replace(
        /source_candidates_signalhire/,
        `source_candidates_signalhire. ${must}`,
      );
      // only first occurrence in prose is ok; avoid breaking enum strings by being careful
      // Revert if we broke the enum line
      if (/enum: \[[^\]]*source_candidates_signalhire\. REQUIRED/.test(g)) {
        g = fs.readFileSync(bakG, "utf8");
        // inject after CRITICAL TOOL RULE instead
        if (/CRITICAL TOOL RULE:/.test(g)) {
          g = g.replace(
            /CRITICAL TOOL RULE:[^\n]*/,
            (m) => `${m}\n${must}`,
          );
        } else {
          g = must + "\n" + g;
        }
      }
      fs.writeFileSync(ginaJs, g, "utf8");
      console.log("Updated gina.js with REQUIRED payload fields note; backup", bakG);
    }
  }
}

console.log("App backup:", bak);
console.log(`
Next (run separately):
  cd ${path.join(ginaDir, "frontend")}
  npm run build
  cd ${ginaDir}
  git add frontend/src/App.jsx maria-source.tool.js routes/run-command.js gina.js
  git commit -m "Pass full action taskHint so Maria can infer roleTitle"
  git push origin main
`);
