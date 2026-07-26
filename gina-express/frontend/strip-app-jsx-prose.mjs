#!/usr/bin/env node
/**
 * Remove orphan prompt prose accidentally pasted into App.jsx
 * (SOURCE_CANDIDATES RULE / GINA TEAM COMMAND RULE outside strings).
 *
 * Usage:
 *   node /tmp/strip-app-jsx-prose.mjs \
 *     /Users/jameslyday/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 */

import fs from "fs";
import path from "path";

const target = path.resolve(
  String(process.argv[2] || "").replace(/^~/, process.env.HOME || ""),
);
if (!target || !fs.existsSync(target)) {
  console.error(
    "Usage: node /tmp/strip-app-jsx-prose.mjs /Users/.../frontend/src/App.jsx",
  );
  process.exit(1);
}

let src = fs.readFileSync(target, "utf8");
const bak = `${target}.bak-prose-${Date.now()}`;
fs.copyFileSync(target, bak);

const markers = [
  "SOURCE_CANDIDATES RULE",
  "GINA TEAM COMMAND RULE",
  "CRITICAL TOOL RULE:",
  "GINA TEAM COMMAND RULE — REQUIRED",
];

let cut = -1;
for (const m of markers) {
  const idx = src.indexOf(m);
  if (idx >= 0 && (cut < 0 || idx < cut)) cut = idx;
}

if (cut < 0) {
  console.log("No orphan prompt markers found.");
  process.exit(0);
}

// Only strip if marker appears outside a comment/string-ish context near EOF
// or as a bare top-level line. Prefer cutting from the marker to EOF when it's
// in the last 20% of the file (typical bad paste).
const ratio = cut / src.length;
const lineStart = src.lastIndexOf("\n", cut) + 1;
const line = src.slice(lineStart, src.indexOf("\n", cut));
const bareLine = /^\s*SOURCE_CANDIDATES RULE|^\s*GINA TEAM COMMAND RULE|^\s*CRITICAL TOOL RULE/.test(
  line,
);

if (ratio > 0.5 || bareLine) {
  // Walk backward to drop preceding blank lines
  let start = cut;
  while (start > 0 && (src[start - 1] === "\n" || src[start - 1] === "\r")) {
    start -= 1;
  }
  // keep one trailing newline
  src = src.slice(0, start).replace(/\s+$/, "") + "\n";
  fs.writeFileSync(target, src, "utf8");
  console.log("Stripped orphan prompt prose from line near", lineStart);
  console.log("Backup:", bak);
  console.log("New size:", src.length);
  console.log("Still has source_candidates handler:", /source_candidates_signalhire/.test(src));
  console.log("\nNext: cd ~/lyday-gina-backend/gina-backend/frontend && npm run build");
  process.exit(0);
}

console.error(
  "Found marker but not confidently orphan trailing prose. Open App.jsx around the error line and delete the pasted RULE block.",
);
console.error("Backup left unused at", bak);
process.exit(1);
