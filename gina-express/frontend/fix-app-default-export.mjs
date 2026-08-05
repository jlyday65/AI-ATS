#!/usr/bin/env node
/**
 * Repair App.jsx when it has no `export default function App`.
 * Then rewrite main.jsx to render <App /> and rebuild-ready state.
 *
 *   node gina-express/frontend/fix-app-default-export.mjs ~/lyday-gina-backend/gina-backend
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
    "Usage: node fix-app-default-export.mjs ~/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

const root = path.resolve(rootArg);
const ginaDir = fs.existsSync(path.join(root, "frontend", "src", "App.jsx"))
  ? root
  : fs.existsSync(path.join(root, "gina-backend", "frontend", "src", "App.jsx"))
    ? path.join(root, "gina-backend")
    : root;

const appPath = path.join(ginaDir, "frontend", "src", "App.jsx");
const mainPath = path.join(ginaDir, "frontend", "src", "main.jsx");
if (!fs.existsSync(appPath)) {
  console.error("App.jsx not found:", appPath);
  process.exit(2);
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
  if (!esbuild) return { ok: false, error: "esbuild missing" };
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

let src = fs.readFileSync(appPath, "utf8");
const bak = `${appPath}.bak-default-export-${Date.now()}`;
fs.copyFileSync(appPath, bak);
console.log("Backup:", bak);

// Diagnostics
const exportDefaults = [...src.matchAll(/export\s+default\s+([^\n;{]+)/g)].map(
  (m) => m[0].trim().slice(0, 120),
);
const fnApps = [...src.matchAll(/function\s+(App|CandidateTracker)\b/g)].map(
  (m) => m[0],
);
console.log("export default lines:", exportDefaults.length ? exportDefaults : "(none)");
console.log("App-like functions:", fnApps.length ? fnApps : "(none)");

// Strip mistaken default exports on helpers
for (const name of [
  "sanitizeGinaJob",
  "sanitizeGinaJobsList",
  "ginaText",
  "activeJobContext",
  "withActiveJobContext",
  "personDedupeKeys",
  "applyAgentAction",
]) {
  const re = new RegExp(`export\\s+default\\s+function\\s+${name}\\b`, "g");
  if (re.test(src)) {
    src = src.replace(re, `function ${name}`);
    console.log("Removed default export from", name);
  }
}
src = src.replace(
  /export\s+default\s+(sanitizeGinaJob|activeJobContext|withActiveJobContext|ginaText)\b\s*;?/g,
  "/* default export removed from helper */",
);

// Ensure we have a default App export
if (/export\s+default\s+function\s+App\b/.test(src)) {
  console.log("Already has export default function App");
} else if (/export\s+default\s+function\s+CandidateTracker\b/.test(src)) {
  src = src.replace(
    /export\s+default\s+function\s+CandidateTracker\b/,
    "export default function App",
  );
  console.log("Renamed export default CandidateTracker → App");
} else if (/function\s+App\s*\(/.test(src)) {
  src = src.replace(/function\s+App\s*\(/, "export default function App(");
  // If we accidentally created a second export default, keep only App's
  const matches = [...src.matchAll(/export\s+default\s+/g)];
  if (matches.length > 1) {
    console.warn("Multiple export default — keeping App, stripping others of 'export default'");
    let seenApp = false;
    src = src.replace(/export\s+default\s+/g, (full, offset) => {
      const slice = src.slice(offset, offset + 40);
      if (/export\s+default\s+function\s+App\b/.test(slice) || /export\s+default\s+App\b/.test(slice)) {
        if (!seenApp) {
          seenApp = true;
          return full;
        }
      }
      return "";
    });
  }
  console.log("Added export default to function App");
} else if (/function\s+CandidateTracker\s*\(/.test(src)) {
  src = src.replace(
    /function\s+CandidateTracker\s*\(/,
    "export default function App(",
  );
  console.log("Renamed function CandidateTracker → export default function App");
} else if (/const\s+App\s*=/.test(src) && !/export\s+default\s+App\b/.test(src)) {
  if (!/export\s+default\b/.test(src)) {
    src = src.trimEnd() + "\n\nexport default App;\n";
    console.log("Appended export default App");
  } else {
    console.error("Has const App but a different export default — manual fix needed");
    console.error("Paste: rg -n \"export default|function App|const App\" App.jsx | head -40");
    process.exit(2);
  }
} else {
  console.error("Could not find App / CandidateTracker function to export.");
  console.error("Run and paste:");
  console.error(
    `  rg -n "export default|^function |^const App|^export " "${appPath}" | head -60`,
  );
  process.exit(2);
}

// Final guard: default must be App
if (
  !/export\s+default\s+function\s+App\b/.test(src) &&
  !/export\s+default\s+App\s*;/.test(src)
) {
  console.error("REFUSING: still no export default App after repair");
  process.exit(2);
}
if (/export\s+default\s+function\s+sanitizeGinaJob\b/.test(src)) {
  console.error("REFUSING: sanitizeGinaJob is still default export");
  process.exit(2);
}

const esbuild = loadEsbuild();
const compiled = canCompile(esbuild, src);
if (!compiled.ok) {
  console.error("REFUSING: App.jsx would not compile:", compiled.error);
  fs.copyFileSync(bak, appPath);
  process.exit(2);
}

// Touch so Vite hash changes
src =
  src.trimEnd() +
  `\n\n/* gina-entry-repair ${new Date().toISOString()} — default export is App */\n`;

fs.writeFileSync(appPath, src, "utf8");
console.log("Wrote", appPath);

// Rewrite main.jsx
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

if (fs.existsSync(mainPath)) {
  const mbak = `${mainPath}.bak-default-export-${Date.now()}`;
  fs.copyFileSync(mainPath, mbak);
  fs.writeFileSync(mainPath, GOOD_MAIN, "utf8");
  console.log("Wrote clean main.jsx");
  console.log("Backup:", mbak);
} else {
  fs.writeFileSync(mainPath, GOOD_MAIN, "utf8");
  console.log("Created main.jsx");
}

console.log(`
OK: App default export + main entry repaired.

  cd ${path.join(ginaDir, "frontend")} && npm run build
  ls dist/assets/index-*.js
  # hash MUST change from index-BDhGJLx5.js

  cd ${path.dirname(ginaDir)}
  git add gina-backend/frontend/src/App.jsx gina-backend/frontend/src/main.jsx
  git add -f gina-backend/frontend/dist
  git status
  git commit -m "Restore export default App + main.jsx entry"
  git pull origin main --rebase && git push origin main
`);
