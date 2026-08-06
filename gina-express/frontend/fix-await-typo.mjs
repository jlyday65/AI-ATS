#!/usr/bin/env node
import fs from "fs";
import path from "path";

const target = path.resolve(String(process.argv[2] || "").replace(/^~/, process.env.HOME || ""));
if (!target || !fs.existsSync(target)) {
  console.error("Usage: node /tmp/fix-await-typo.mjs /Users/.../App.jsx");
  process.exit(1);
}
let src = fs.readFileSync(target, "utf8");
const bak = `${target}.bak-await-${Date.now()}`;
fs.copyFileSync(target, bak);
const before = src;
src = src.replace(/async\s+function\s+await\s+applyAgentAction/g, "async function applyAgentAction");
// also fix call sites that should await, without touching the declaration
src = src.replace(
  /(?<!function\s)(?<!async\s+function\s)(?<!await\s)\bapplyAgentAction\s*\(\s*action\s*\)/g,
  "await applyAgentAction(action)",
);
// undo if we double-awaited
src = src.replace(/await\s+await\s+applyAgentAction/g, "await applyAgentAction");
if (src === before) {
  console.log("No async function await typo found; writing call-site safe awaits only if needed");
}
fs.writeFileSync(target, src, "utf8");
console.log("Fixed:", target);
console.log("Backup:", bak);
console.log("Declaration ok:", /async function applyAgentAction\s*\(/.test(src) && !/async function await applyAgentAction/.test(src));
