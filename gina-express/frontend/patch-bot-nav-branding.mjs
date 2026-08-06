#!/usr/bin/env node
/**
 * Restore ATS nav branding after App.jsx nuclear restore:
 * - Rename visible "Agent" label → "Gina" (view key stays "agent")
 * - Prefix bot nav labels with role emojis
 *
 * ONE LINE:
 *   node gina-express/frontend/patch-bot-nav-branding.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 */

import fs from "fs";
import path from "path";
import { createRequire } from "module";

const raw = String(process.argv[2] || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");
let target = path.resolve(raw);
if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
  const cand = path.join(target, "frontend", "src", "App.jsx");
  if (fs.existsSync(cand)) target = cand;
  else {
    const cand2 = path.join(target, "gina-backend", "frontend", "src", "App.jsx");
    if (fs.existsSync(cand2)) target = cand2;
  }
}
if (!target || !fs.existsSync(target)) {
  console.error(
    "Usage (one line): node patch-bot-nav-branding.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx",
  );
  process.exit(1);
}

/** Role-matched face emojis for the recruiting team nav */
const LABELS = {
  agent: "👩🏿 Gina",
  gina: "👩🏿 Gina",
  maria: "👩🏻 Maria",
  michelle: "👩🏾 Michelle",
  kelly: "👩🏼 Kelley",
  kelley: "👩🏼 Kelley",
  ashton: "👨 Ashton",
};

function loadEsbuild(appFile) {
  const frontend = path.resolve(path.dirname(appFile), "..");
  try {
    const req = createRequire(
      path.join(frontend, "node_modules", "esbuild", "package.json"),
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

let src = fs.readFileSync(target, "utf8");
const bak = `${target}.bak-bot-branding-${Date.now()}`;
fs.copyFileSync(target, bak);

const esbuild = loadEsbuild(target);
const before = canCompile(esbuild, src);
if (!before.ok) {
  console.error("App.jsx does not compile before patch:", before.error);
  process.exit(2);
}

let changes = 0;

// Nav items: { key: "agent", icon: Bot, label: "Agent" }
for (const [key, label] of Object.entries(LABELS)) {
  const re = new RegExp(
    `(key:\\s*["']${key}["']\\s*,\\s*icon:\\s*[A-Za-z0-9_]+\\s*,\\s*label:\\s*)(["'])([^"']*)\\2`,
    "g",
  );
  src = src.replace(re, (full, prefix, q, oldLabel) => {
    if (oldLabel === label) return full;
    changes += 1;
    console.log(`  nav ${key}: "${oldLabel}" → "${label}"`);
    return `${prefix}${q}${label}${q}`;
  });
}

// Common heading / tab leftovers that still say plain "Agent"
const headingReplacements = [
  [/<(h[1-3]|div|span|button)([^>]*)>\s*(?:🗂️\s*)?Agent\s*</g, "<$1$2>👩🏿 Gina<"],
  [/<(h[1-3]|div|span|button)([^>]*)>\s*🗂️\s*Gina\s*</g, "<$1$2>👩🏿 Gina<"],
  [/placeholder=["']Ask Agent/g, 'placeholder="Ask Gina'],
  [/Sync with Agent/g, "Sync with Gina"],
  [/Failed to reach Agent:/g, "Failed to reach Gina:"],
];
for (const [re, rep] of headingReplacements) {
  const next = src.replace(re, rep);
  if (next !== src) {
    changes += 1;
    src = next;
  }
}

if (!changes) {
  console.log("No branding changes needed (already applied or nav shape differs).");
  console.log("Backup unused:", bak);
  process.exit(0);
}

const after = canCompile(esbuild, src);
if (!after.ok) {
  console.error("REFUSING: branding patch would break compile:", after.error);
  fs.copyFileSync(bak, target);
  process.exit(2);
}

fs.writeFileSync(target, src, "utf8");
console.log("OK: restored Gina naming + bot emojis in nav");
console.log("Backup:", bak);
console.log("Wrote:", target);
console.log(`
Next:
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend
  git add gina-backend/frontend/src/App.jsx
  git commit -m "Restore Gina nav name and bot emojis"
  git pull origin main --rebase
  git push origin main
`);
