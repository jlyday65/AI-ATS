#!/usr/bin/env node
import fs from "fs";
import path from "path";

const cal = path.resolve(
  String(process.argv[2] || "").replace(/^~/, process.env.HOME || ""),
);
if (!fs.existsSync(cal)) {
  console.error(
    "Usage: node /tmp/fix-calendar-import.mjs /Users/jameslyday/lyday-gina-backend/gina-backend/lib/calendar.js",
  );
  process.exit(1);
}
let t = fs.readFileSync(cal, "utf8");
const bak = `${cal}.bak-import-${Date.now()}`;
fs.copyFileSync(cal, bak);
const before = t;
t = t.replaceAll('"./agents/command-agent.tool.js"', '"../agents/command-agent.tool.js"');
t = t.replaceAll("'./agents/command-agent.tool.js'", "'../agents/command-agent.tool.js'");
t = t.replaceAll('"./agents/registry.js"', '"../agents/registry.js"');
t = t.replaceAll("'./agents/registry.js'", "'../agents/registry.js'");
// Also fix from "lib/agents/..." absolute-style mistakes in import strings
t = t.replaceAll('"/lib/agents/command-agent.tool.js"', '"../agents/command-agent.tool.js"');
if (t === before) {
  // show import lines
  const lines = before.split("\n");
  console.log("No automatic replace. Import-related lines:");
  lines.forEach((l, i) => {
    if (/agents\/|command-agent|commandAgent/.test(l)) console.log(`${i + 1}:${l}`);
  });
  process.exit(2);
}
fs.writeFileSync(cal, t, "utf8");
console.log("Fixed import path in", cal);
console.log("Backup:", bak);
