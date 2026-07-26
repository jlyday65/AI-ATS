#!/usr/bin/env node
/**
 * Prefer jobTitle over headline for board "role" in applyAgentAction.
 *
 * Usage:
 *   node /tmp/patch-role-jobtitle.mjs /Users/.../frontend/src/App.jsx
 */
import fs from "fs";
import path from "path";

const target = path.resolve(
  String(process.argv[2] || "").replace(/^~/, process.env.HOME || ""),
);
if (!fs.existsSync(target)) {
  console.error("Usage: node /tmp/patch-role-jobtitle.mjs /Users/.../App.jsx");
  process.exit(1);
}
let src = fs.readFileSync(target, "utf8");
const bak = `${target}.bak-role-${Date.now()}`;
fs.copyFileSync(target, bak);

let n = 0;
const variants = [
  [
    /role:\s*payload\.role\s*\|\|\s*payload\.jobTitle\s*\|\|\s*""/g,
    'role: payload.jobTitle || payload.role || ""',
  ],
  [
    /role:\s*payload\.role\s*\|\|\s*payload\.jobTitle\s*\|\|\s*payload\.headline\s*\|\|\s*""/g,
    'role: payload.jobTitle || payload.role || ""',
  ],
];
for (const [re, rep] of variants) {
  const before = src;
  src = src.replace(re, rep);
  if (src !== before) n += 1;
}

if (!n && !/role:\s*payload\.jobTitle\s*\|\|\s*payload\.role/.test(src)) {
  // Insert jobTitle preference near addCandidate in applyAgentAction
  if (/addCandidate\(\{\s*name:\s*payload\.name/.test(src)) {
    src = src.replace(
      /addCandidate\(\{\s*name:\s*payload\.name,\s*role:\s*([^,]+),/,
      'addCandidate({\n          name: payload.name,\n          role: payload.jobTitle || payload.role || "",',
    );
    n += 1;
  }
}

fs.writeFileSync(target, src, "utf8");
console.log(n ? `Patched role→jobTitle (${n})` : "Pattern already preferred jobTitle or not found");
console.log("Backup:", bak);
