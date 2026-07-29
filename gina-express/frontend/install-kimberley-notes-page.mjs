#!/usr/bin/env node
/**
 * Install Kimberley Notes as a STANDALONE page only — does NOT modify App.jsx.
 *
 * After deploy, open:
 *   https://<your-gina-host>/kimberley-notes.html
 *
 * Usage:
 *   node gina-express/frontend/install-kimberley-notes-page.mjs \
 *     /Users/jameslyday/lyday-gina-backend/gina-backend/frontend
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendArg = String(process.argv[2] || "")
  .replace(/^~/, process.env.HOME || "")
  .trim();
if (!frontendArg) {
  console.error(
    "Usage: node install-kimberley-notes-page.mjs /Users/jameslyday/lyday-gina-backend/gina-backend/frontend",
  );
  process.exit(1);
}

let frontendDir = path.resolve(frontendArg);
if (frontendDir.endsWith(`${path.sep}src`) || frontendDir.endsWith("App.jsx")) {
  frontendDir = path.dirname(frontendDir.endsWith("App.jsx") ? path.dirname(frontendDir) : frontendDir);
}
if (path.basename(frontendDir) !== "frontend") {
  const guess = path.join(frontendDir, "frontend");
  if (fs.existsSync(guess)) frontendDir = guess;
}

const htmlSrc = path.join(__dirname, "kimberley-notes.html");
if (!fs.existsSync(htmlSrc)) {
  console.error("Missing", htmlSrc);
  process.exit(2);
}

const publicDir = path.join(frontendDir, "public");
fs.mkdirSync(publicDir, { recursive: true });
const dest = path.join(publicDir, "kimberley-notes.html");
fs.copyFileSync(htmlSrc, dest);
console.log("Wrote", dest);
console.log(`
IMPORTANT: This does not touch App.jsx (avoids white screens).

Next:
  cd ${frontendDir} && npm run build
  cd ${path.resolve(frontendDir, "..", "..")}
  git add gina-backend/frontend/public/kimberley-notes.html
  git status
  git commit -m "Add standalone Kimberley Notes page (no App.jsx changes)"
  git push origin main

After Railway redeploy, open:
  https://<your-gina-host>/kimberley-notes.html

Optional: bookmark that URL. Do NOT patch App.jsx for Notes while ATS is unstable.
`);
