#!/usr/bin/env node
/**
 * Emergency: disable Kimberley Notes UI so Gina ATS stops white-screening.
 *
 * IMPORTANT: fully REMOVES Gate/Panel (does not leave `extends React.Component`
 * stubs — those still crash the module when React has no default import).
 *
 * Usage:
 *   node gina-express/frontend/emergency-disable-kimberley-notes.mjs /Users/.../frontend/src/App.jsx
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(
  String(process.argv[2] || "").replace(/^~/, process.env.HOME || "").trim(),
);
if (!target || !fs.existsSync(target)) {
  console.error(
    "Usage: node emergency-disable-kimberley-notes.mjs /Users/.../frontend/src/App.jsx",
  );
  process.exit(1);
}

// Prefer the nuclear restore — it removes Notes without leaving React.Component stubs.
const restore = path.join(__dirname, "restore-ats-ui.mjs");
const r = spawnSync(process.execPath, [restore, target], { stdio: "inherit" });
process.exit(r.status ?? 1);
