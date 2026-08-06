#!/usr/bin/env node
/**
 * Fix: bundle renders sanitizeGinaJob (or another helper) instead of App.
 * Symptom: "React never mounted (#root is empty)" or React #31.
 *
 * End of broken bundle looks like:
 *   createRoot(...).render(<StrictMode><sanitizeGinaJob /></StrictMode>)
 *
 *   node gina-express/frontend/fix-main-entry.mjs ~/lyday-gina-backend/gina-backend
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const rootArg = String(process.argv[2] || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");
if (!rootArg) {
  console.error(
    "Usage: node fix-main-entry.mjs ~/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

const root = path.resolve(rootArg);
const ginaDir = fs.existsSync(path.join(root, "frontend", "src", "main.jsx"))
  ? root
  : fs.existsSync(path.join(root, "gina-backend", "frontend", "src", "main.jsx"))
    ? path.join(root, "gina-backend")
    : root;

const mainPath = path.join(ginaDir, "frontend", "src", "main.jsx");
const appPath = path.join(ginaDir, "frontend", "src", "App.jsx");
if (!fs.existsSync(mainPath)) {
  console.error("main.jsx not found:", mainPath);
  process.exit(2);
}
if (!fs.existsSync(appPath)) {
  console.error("App.jsx not found:", appPath);
  process.exit(2);
}

// Delegate App default-export repair to the dedicated fixer when needed
let app = fs.readFileSync(appPath, "utf8");
if (
  !/export\s+default\s+function\s+App\b/.test(app) &&
  !/export\s+default\s+App\b/.test(app)
) {
  console.log("App default export missing — running fix-app-default-export.mjs");
  const r = spawnSync(
    process.execPath,
    [path.join(__dirname, "fix-app-default-export.mjs"), ginaDir],
    { stdio: "inherit" },
  );
  if (r.status !== 0) process.exit(r.status || 2);
  app = fs.readFileSync(appPath, "utf8");
}

// Ensure helpers are NOT accidentally default-exported
if (/export\s+default\s+function\s+sanitizeGinaJob\b/.test(app)) {
  app = app.replace(
    /export\s+default\s+function\s+sanitizeGinaJob\b/,
    "function sanitizeGinaJob",
  );
  fs.writeFileSync(appPath, app, "utf8");
  console.log("Removed mistaken default export on sanitizeGinaJob");
}

const GOOD_MAIN = `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Missing #root element in index.html");
}

createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`;

const bak = `${mainPath}.bak-main-entry-${Date.now()}`;
fs.copyFileSync(mainPath, bak);
fs.writeFileSync(mainPath, GOOD_MAIN, "utf8");
console.log("Wrote clean main.jsx → renders <App />");
console.log("Backup:", bak);

// Quick compile check if esbuild available
try {
  const req = createRequire(
    path.join(ginaDir, "frontend", "node_modules", "esbuild", "package.json"),
  );
  const esbuild = req("esbuild");
  esbuild.transformSync(GOOD_MAIN, {
    loader: "jsx",
    jsx: "automatic",
    logLevel: "silent",
  });
  console.log("main.jsx compiles OK");
} catch (e) {
  console.warn("esbuild check skipped/failed:", e?.message || e);
}

console.log(`
Next:
  cd ${path.join(ginaDir, "frontend")} && npm run build
  ls dist/assets/index-*.js
  cd ${path.dirname(ginaDir)}
  git add gina-backend/frontend/src/main.jsx gina-backend/frontend/src/App.jsx
  git add -f gina-backend/frontend/dist
  git commit -m "Fix empty #root: main.jsx must render App, not sanitizeGinaJob"
  git pull origin main --rebase && git push origin main
`);
