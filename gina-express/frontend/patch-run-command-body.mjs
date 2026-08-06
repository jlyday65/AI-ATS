#!/usr/bin/env node
/**
 * Patch App.jsx /ats/run-command fetch to send the full action row
 * so Maria can infer roleTitle from task text.
 *
 * Also overwrites maria-source.tool.js + routes/run-command.js from GitHub.
 *
 * Usage:
 *   node /tmp/patch-run-command-body.mjs /Users/jameslyday/lyday-gina-backend/gina-backend
 */

import fs from "fs";
import path from "path";
import https from "https";

const root = path.resolve(
  String(process.argv[2] || "").replace(/^~/, process.env.HOME || ""),
);
const ginaDir = fs.existsSync(path.join(root, "gina-backend", "server.js"))
  ? path.join(root, "gina-backend")
  : root;

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
  console.error("App.jsx not found at", appPath);
  process.exit(1);
}

let app = fs.readFileSync(appPath, "utf8");
const bak = `${appPath}.bak-body-${Date.now()}`;
fs.copyFileSync(appPath, bak);

const oldBody = `body: JSON.stringify({
            type,
            actionId: action.id,
            payload: payload || {},
          })`;

const newBody = `body: JSON.stringify({
            type,
            actionId: action.id,
            payload: payload || {},
            action,
            summary: action.summary || action.detail || "",
          })`;

if (app.includes("summary: action.summary || action.detail")) {
  console.log("App.jsx already sends full action to /ats/run-command");
} else if (app.includes(oldBody)) {
  app = app.replace(oldBody, newBody);
  fs.writeFileSync(appPath, app, "utf8");
  console.log("Patched App.jsx fetch body");
} else if (
  app.includes("payload: payload || {}") &&
  app.includes("/ats/run-command")
) {
  app = app.replace(
    /body:\s*JSON\.stringify\(\{\s*type,\s*actionId:\s*action\.id,\s*payload:\s*payload\s*\|\|\s*\{\},?\s*\}\)/m,
    `body: JSON.stringify({
            type,
            actionId: action.id,
            payload: payload || {},
            action,
            summary: action.summary || action.detail || "",
          })`,
  );
  fs.writeFileSync(appPath, app, "utf8");
  console.log("Patched App.jsx fetch body (regex)");
} else {
  console.warn(
    "Could not auto-patch App.jsx fetch body — still updating server files.",
  );
}

for (const rel of ["maria-source.tool.js", "routes/run-command.js"]) {
  const dest = path.join(ginaDir, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const body = await download(`${RAW}/${rel}`);
  fs.writeFileSync(dest, body, "utf8");
  console.log("Wrote", dest);
}

console.log("Backup App.jsx:", bak);
console.log(`
Next:
  cd ${path.join(ginaDir, "frontend")} && npm run build
  cd ${ginaDir}
  git add frontend/src/App.jsx maria-source.tool.js routes/run-command.js
  git commit -m "Infer Maria roleTitle from full queued action payload"
  git push origin main
`);
