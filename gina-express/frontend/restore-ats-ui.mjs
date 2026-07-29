#!/usr/bin/env node
/**
 * Nuclear restore: get Gina ATS UI loading again (no Kimberley Notes UI).
 *
 * Fixes the usual white-screen causes left by Notes / applyAgentAction patches:
 * - class ... extends Component / React.Component when React isn't imported
 * - leftover KimberleyNotesGate / Panel mounts
 * - `async function await applyAgentAction` typo
 * - duplicate BOT_NAMES
 *
 * Does NOT try to keep Notes working — Notes stays removed until a later safe enable.
 *
 * Usage:
 *   node gina-express/frontend/restore-ats-ui.mjs \
 *     /Users/jameslyday/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 */

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(
  String(process.argv[2] || "").replace(/^~/, process.env.HOME || "").trim(),
);
if (!target || !fs.existsSync(target)) {
  console.error(
    "Usage: node restore-ats-ui.mjs /Users/jameslyday/lyday-gina-backend/gina-backend/frontend/src/App.jsx",
  );
  process.exit(1);
}

const bak = `${target}.bak-restore-${Date.now()}`;
fs.copyFileSync(target, bak);
console.log("Backup:", bak);

function braceEnd(text, braceAt) {
  let depth = 0;
  for (let j = braceAt; j < text.length; j++) {
    if (text[j] === "{") depth++;
    else if (text[j] === "}") {
      depth--;
      if (depth === 0) return j + 1;
    }
  }
  return -1;
}

function removeNamedBlocks(src, names) {
  let out = src;
  for (const name of names) {
    for (let guard = 0; guard < 8; guard++) {
      const fn = out.search(new RegExp(`function\\s+${name}\\s*\\(`));
      const cls = out.search(new RegExp(`class\\s+${name}\\s+extends\\s+`));
      const start = fn >= 0 && cls >= 0 ? Math.min(fn, cls) : fn >= 0 ? fn : cls;
      if (start < 0) break;
      const braceAt = out.indexOf("{", start);
      let end = braceEnd(out, braceAt);
      if (end < 0) {
        const after = out.slice(start + 1);
        const endRel = after.search(
          /\n\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class)\s+[A-Za-z_]/,
        );
        if (endRel < 0) {
          console.warn("Could not fully remove", name, "- manual edit may be needed");
          break;
        }
        end = start + 1 + endRel;
      }
      out = out.slice(0, start) + out.slice(end);
      console.log("Removed", name);
    }
  }
  return out;
}

function diagnose(src) {
  return {
    size: src.length,
    hasApp:
      /function\s+App\b/.test(src) ||
      /export\s+default\s+function\s+App\b/.test(src) ||
      /const\s+App\s*=/.test(src) ||
      /export\s+default\s+App\b/.test(src),
    kimberleyGate: /KimberleyNotesGate/.test(src),
    kimberleyPanel: /KimberleyNotesPanel/.test(src),
    extendsComponent: /extends\s+Component\b/.test(src),
    extendsReactComponent: /extends\s+React\.Component\b/.test(src),
    reactDefaultImport: /import\s+React\b/.test(src),
    awaitTypo: /async\s+function\s+await\s+applyAgentAction/.test(src),
    botNames: (src.match(/const BOT_NAMES\s*=\s*new Set/g) || []).length,
    applyFns: (src.match(/(?:async\s+)?function\s+(?:await\s+)?applyAgentAction\b/g) || [])
      .length,
  };
}

let src = fs.readFileSync(target, "utf8");
console.log("Before:", diagnose(src));

// 1) Fix await typo first (syntax / runtime breaker)
src = src.replace(
  /async\s+function\s+await\s+applyAgentAction/g,
  "async function applyAgentAction",
);

// 2) Remove ALL Kimberley Notes UI symbols (do not leave React.Component stubs)
src = removeNamedBlocks(src, ["KimberleyNotesGate", "KimberleyNotesPanel"]);

// 3) Remove mounts / nav
src = src.replace(
  /\n[ \t]*\{view === "kimberley" && <KimberleyNotes(?:Panel|Gate)\s*\/>\}\s*\n/g,
  "\n",
);
src = src.replace(
  /\s*,?\s*\{\s*id:\s*["']kimberley["']\s*,\s*label:\s*["']Kimberley's Notes["']\s*\}/g,
  "",
);
src = src.replace(
  /\s*,?\s*\{\s*id:\s*["']kimberley["']\s*,\s*label:\s*["']Kimberley Notes["']\s*\}/g,
  "",
);
src = src.replace(
  /\s*,?\s*\{\s*id:\s*["']kimberley["'][^}]*\}\s*/g,
  "",
);
src = src.replace(/,\s*,/g, ",");

// 4) Strip any remaining KimberleyNotes identifier lines that are mounts/comments
src = src
  .split("\n")
  .filter((line) => {
    if (/KimberleyNotes(Gate|Panel)/.test(line) && /view\s*===|return\s+null|EMERGENCY/.test(line)) {
      return false;
    }
    return true;
  })
  .join("\n");

// 5) If a bare `extends Component` remains anywhere Notes-related, it's gone with the class.
//    If other code wrongly references Component without import, leave alone.

// 6) Dedupe BOT_NAMES via sibling script if needed
const botCount = (src.match(/const BOT_NAMES\s*=\s*new Set/g) || []).length;
fs.writeFileSync(target, src, "utf8");
if (botCount > 1) {
  console.log("Duplicate BOT_NAMES detected — running fix-duplicate-bot-names…");
  const dedupe = path.join(__dirname, "fix-duplicate-bot-names.mjs");
  const d = spawnSync(process.execPath, [dedupe, target], { stdio: "inherit" });
  if (d.status !== 0) {
    console.warn("dedupe failed; continuing with Notes stripped");
  }
  src = fs.readFileSync(target, "utf8");
}

// 7) If still no App function, try git / backups
let d = diagnose(src);
if (!d.hasApp || d.kimberleyGate || d.kimberleyPanel || d.awaitTypo) {
  console.log("Still unhealthy — trying clean base from git/backups…");
  const nuke = path.join(__dirname, "nuke-fix-app-jsx.mjs");
  if (fs.existsSync(nuke)) {
    const n = spawnSync(process.execPath, [nuke, target], { stdio: "inherit" });
    if (n.status === 0) {
      src = fs.readFileSync(target, "utf8");
      // nuke may not remove Kimberley — strip again
      src = removeNamedBlocks(src, ["KimberleyNotesGate", "KimberleyNotesPanel"]);
      src = src.replace(
        /\n[ \t]*\{view === "kimberley" && <KimberleyNotes(?:Panel|Gate)\s*\/>\}\s*\n/g,
        "\n",
      );
      src = src.replace(
        /\s*,?\s*\{\s*id:\s*["']kimberley["'][^}]*\}\s*/g,
        "",
      );
      fs.writeFileSync(target, src, "utf8");
    }
  }
}

d = diagnose(fs.readFileSync(target, "utf8"));
console.log("After:", d);

if (d.kimberleyGate || d.kimberleyPanel || d.awaitTypo || d.botNames > 1) {
  console.error(`
RESTORE INCOMPLETE. Use git history on the Mac:

  cd ~/lyday-gina-backend/gina-backend
  git log --oneline -- frontend/src/App.jsx | head -20
  # pick a commit from BEFORE Kimberley Notes / white screen, then:
  git checkout <GOOD_SHA> -- frontend/src/App.jsx
  cd frontend && npm run build
  cd .. && git add frontend/src/App.jsx && git commit -m "Restore App.jsx from known good commit" && git push origin main
`);
  process.exit(2);
}

if (!d.hasApp) {
  console.error("No App function found after restore — use git checkout of a good App.jsx");
  process.exit(2);
}

console.log(`
=== ATS UI restore ready (Kimberley Notes UI removed) ===

  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend/gina-backend
  git add frontend/src/App.jsx
  git commit -m "Restore ATS UI: strip Kimberley Notes to stop white screen"
  git push origin main

Railway → Redeploy → hard refresh the browser.

Team commands (Maria etc.) still work via /ats/run-command backend files.
Notes panel stays OFF until ATS is confirmed up.
`);
