#!/usr/bin/env node
/**
 * Emergency: disable Kimberley Notes UI so Gina ATS stops white-screening.
 * Does NOT delete backend notes routes — only stops rendering the panel.
 *
 * Usage (one line, no backslash):
 *   node gina-express/frontend/emergency-disable-kimberley-notes.mjs /Users/jameslyday/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 */

import fs from "fs";
import path from "path";

const target = path.resolve(
  String(process.argv[2] || "").replace(/^~/, process.env.HOME || "").trim(),
);
if (!target || !fs.existsSync(target)) {
  console.error(
    "Usage: node emergency-disable-kimberley-notes.mjs /Users/jameslyday/lyday-gina-backend/gina-backend/frontend/src/App.jsx",
  );
  process.exit(1);
}

let src = fs.readFileSync(target, "utf8");
const bak = `${target}.bak-emergency-${Date.now()}`;
fs.copyFileSync(target, bak);

let n = 0;

// Comment out every render of the panel
src = src.replace(
  /^\s*\{view === "kimberley" && <KimberleyNotesPanel \/>\}\s*$/gm,
  (m) => {
    n += 1;
    return `        {/* EMERGENCY disabled: ${m.trim()} */}`;
  },
);
src = src.replace(
  /\{view === "kimberley" && <KimberleyNotesPanel \/>\}/g,
  (m) => {
    n += 1;
    return `{false && null /* EMERGENCY disabled KimberleyNotesPanel */}`;
  },
);

// Stub the function body to a no-op so even accidental mounts can't crash
const start = src.search(/function\s+KimberleyNotesPanel\s*\(/);
if (start >= 0) {
  const after = src.slice(start + 1);
  const endRel = after.search(
    /\n\s*function\s+(ResumeUploadPanel|CandidateTracker|AgentPanel|MariaView|App|GinaBriefingCard)\b/,
  );
  const stub = `function KimberleyNotesPanel() {
  // EMERGENCY stub — panel disabled to restore ATS UI
  return null;
}
`;
  if (endRel >= 0) {
    const end = start + 1 + endRel;
    src = src.slice(0, start) + stub + "\n" + src.slice(end);
    n += 1;
    console.log("Stubbed KimberleyNotesPanel → return null");
  } else {
    const braceAt = src.indexOf("{", start);
    let depth = 0;
    let end = -1;
    for (let i = braceAt; i < src.length; i += 1) {
      if (src[i] === "{") depth += 1;
      else if (src[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end > start) {
      src = src.slice(0, start) + stub + "\n" + src.slice(end);
      n += 1;
      console.log("Stubbed KimberleyNotesPanel via brace match");
    }
  }
}

// Remove kimberley nav entry if present (can break view routers)
if (/id:\s*["']kimberley["']/.test(src)) {
  src = src.replace(/\s*,?\s*\{\s*id:\s*["']kimberley["']\s*,\s*label:\s*["']Kimberley's Notes["']\s*\}/g, "");
  // clean double commas
  src = src.replace(/,\s*,/g, ",");
  n += 1;
  console.log("Removed kimberley nav id");
}

fs.writeFileSync(target, src, "utf8");
console.log("Backup:", bak);
console.log(n ? `Emergency disable applied (${n})` : "No Kimberley UI markers found");
console.log(`
Next:
  cd ~/lyday-gina-backend/gina-backend/frontend
  npm run build
  cd ~/lyday-gina-backend/gina-backend
  git add frontend/src/App.jsx
  git status
  git commit -m "Emergency: disable Kimberley Notes UI to restore ATS"
  git push origin main

Then Railway → Redeploy.
If still white: confirm Railway Build Command builds the frontend, e.g.
  cd frontend && npm ci && npm run build && cd .. && npm start
`);
