#!/usr/bin/env node
/**
 * Repair App.jsx when default export is broken.
 *
 * Seen in production:
 *   export default
 *   <blank lines>
 *   /** Safe: never closes over selectedJob... *\/
 *   function activeJobContext() { ... }
 *   function CandidateTracker() { ... }   // real app, not default-exported
 *
 * Bundle then rendered sanitizeGinaJob / wrong default → empty #root.
 *
 *   node gina-express/frontend/fix-app-default-export.mjs ~/lyday-gina-backend/gina-backend
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";

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

/** Remove `export default` that isn't followed by function/class/identifier. */
function stripOrphanDefaultExports(src) {
  // export default <whitespace/comments> then NOT a valid export target
  return src.replace(
    /export\s+default\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*|\s)*(?=(?:\/\*|\/\/|function\s+(?!App\b|CandidateTracker\b)|const\s+(?!App\b)|let\s+|var\s+|class\s+(?!App\b)|$))/g,
    (match, offset, whole) => {
      // If this is `export default function App` keep it — handled by lookahead (?!App)
      const after = whole.slice(offset + match.length, offset + match.length + 40);
      if (/^function\s+(App|CandidateTracker)\b/.test(after)) return match;
      if (/^(App|CandidateTracker)\b/.test(after)) return match;
      console.log("Stripped orphan export default near:", after.trim().slice(0, 60));
      return "";
    },
  );
}

function stripHelperDefaultExports(src) {
  let out = src;
  for (const name of [
    "sanitizeGinaJob",
    "sanitizeGinaJobsList",
    "ginaText",
    "activeJobContext",
    "withActiveJobContext",
    "personDedupeKeys",
    "applyAgentAction",
    "beginCandidateImportSession",
    "dedupeBoardCandidates",
  ]) {
    const reFn = new RegExp(`export\\s+default\\s+function\\s+${name}\\b`, "g");
    if (reFn.test(out)) {
      out = out.replace(reFn, `function ${name}`);
      console.log("Removed default export from function", name);
    }
    const reId = new RegExp(`export\\s+default\\s+${name}\\s*;?`, "g");
    if (reId.test(out)) {
      out = out.replace(reId, `/* removed export default ${name} */`);
      console.log("Removed default export of", name);
    }
  }
  return out;
}

function ensureSingleAppDefault(src) {
  let out = src;

  // Normalize CandidateTracker → App (name only first)
  if (/function\s+CandidateTracker\s*\(/.test(out)) {
    out = out.replace(/function\s+CandidateTracker\s*\(/g, "function App(");
    console.log("Renamed function CandidateTracker → App");
  }
  out = out.replace(
    /export\s+default\s+function\s+CandidateTracker\b/g,
    "export default function App",
  );
  out = out.replace(
    /export\s+default\s+CandidateTracker\s*;?/g,
    "export default App;",
  );

  // Count default exports
  const defaults = [...out.matchAll(/export\s+default\b/g)];
  console.log("export default count after cleanup:", defaults.length);

  if (/export\s+default\s+function\s+App\b/.test(out)) {
    // Remove any OTHER export default
    if (defaults.length > 1) {
      let kept = false;
      out = out.replace(/export\s+default\b/g, (full, offset) => {
        const slice = out.slice(offset, offset + 48);
        if (/export\s+default\s+function\s+App\b/.test(slice)) {
          if (!kept) {
            kept = true;
            return full;
          }
        }
        console.log("Removing extra:", slice.trim().slice(0, 48));
        return "/* duplicate default removed */";
      });
    }
    return out;
  }

  if (/function\s+App\s*\(/.test(out)) {
    // Add export default to the FIRST function App only
    let added = false;
    out = out.replace(/function\s+App\s*\(/g, (full) => {
      if (added) return full;
      added = true;
      return "export default function App(";
    });
    console.log("Added export default to function App");
    // Strip any other defaults
    let kept = false;
    out = out.replace(/export\s+default\b/g, (full, offset) => {
      const slice = out.slice(offset, offset + 48);
      if (/export\s+default\s+function\s+App\b/.test(slice)) {
        if (!kept) {
          kept = true;
          return full;
        }
      }
      return "/* duplicate default removed */";
    });
    return out;
  }

  console.error("No App function found after rename");
  process.exit(2);
}

let src = fs.readFileSync(appPath, "utf8");
const bak = `${appPath}.bak-default-export-${Date.now()}`;
fs.copyFileSync(appPath, bak);
console.log("Backup:", bak);

console.log(
  "Before — export default snippets:",
  [...src.matchAll(/export\s+default[\s\S]{0,80}/g)]
    .map((m) => JSON.stringify(m[0].slice(0, 80)))
    .slice(0, 5),
);

// Explicit fix for the known corruption pattern:
//   export default
//   <blank lines>
//   /** Safe: never closes over selectedJob...
src = src.replace(
  /export\s+default\s*\n(?:[ \t]*\n)+[ \t]*\/\*\*/g,
  "\n/**",
);
console.log("Applied blank-line orphan export default strip");

src = stripOrphanDefaultExports(src);
src = stripHelperDefaultExports(src);
src = ensureSingleAppDefault(src);

// One more orphan pass after renames
src = stripOrphanDefaultExports(src);

if (!/export\s+default\s+function\s+App\b/.test(src)) {
  console.error("REFUSING: still no export default function App");
  process.exit(2);
}
const defaultCount = (src.match(/export\s+default\b/g) || []).length;
if (defaultCount !== 1) {
  console.error("REFUSING: expected exactly 1 export default, found", defaultCount);
  // Last-ditch: keep only the App one
  let kept = false;
  src = src.replace(/export\s+default\b/g, (full, offset) => {
    const slice = src.slice(offset, offset + 48);
    if (/export\s+default\s+function\s+App\b/.test(slice) && !kept) {
      kept = true;
      return full;
    }
    return "/* stripped extra default */";
  });
}
if ((src.match(/export\s+default\b/g) || []).length !== 1) {
  console.error("Still not exactly one default export");
  process.exit(2);
}

const esbuild = loadEsbuild();
const compiled = canCompile(esbuild, src);
if (!compiled.ok) {
  console.error("REFUSING: App.jsx would not compile:", compiled.error);
  fs.copyFileSync(bak, appPath);
  process.exit(2);
}

src =
  src.trimEnd() +
  `\n\n/* gina-entry-repair ${new Date().toISOString()} — single export default function App */\n`;

fs.writeFileSync(appPath, src, "utf8");
console.log("Wrote", appPath);
console.log("Compiles: OK; export default function App: yes");

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
  console.log("main.jsx backup:", mbak);
}
fs.writeFileSync(mainPath, GOOD_MAIN, "utf8");
console.log("Wrote clean main.jsx → <App />");

console.log(`
OK.

  cd ${path.join(ginaDir, "frontend")} && npm run build
  ls dist/assets/index-*.js
  # MUST be a NEW hash (not index-BDhGJLx5.js)

  cd ${path.dirname(ginaDir)}
  git add gina-backend/frontend/src/App.jsx gina-backend/frontend/src/main.jsx
  git add -f gina-backend/frontend/dist
  git status
  git commit -m "Restore single export default App + main entry"
  git pull origin main --rebase && git push origin main
`);
