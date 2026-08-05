#!/usr/bin/env node
/**
 * Find likely React #31 sources in Gina App.jsx
 * (Objects are not valid as a React child — empty {}).
 *
 *   node gina-express/frontend/diagnose-react-31.mjs ~/lyday-gina-backend/gina-backend
 */
import fs from "fs";
import path from "path";

const rootArg = String(process.argv[2] || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");
if (!rootArg) {
  console.error(
    "Usage: node diagnose-react-31.mjs ~/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}
const root = path.resolve(rootArg);
const appPath = fs.existsSync(path.join(root, "frontend", "src", "App.jsx"))
  ? path.join(root, "frontend", "src", "App.jsx")
  : path.join(root, "gina-backend", "frontend", "src", "App.jsx");

const src = fs.readFileSync(appPath, "utf8");
const lines = src.split(/\n/);
console.log("File:", appPath, "lines:", lines.length);

const patterns = [
  [/\|\|\s*\{\s*\}/, "|| {} fallback (renders empty object if used in JSX)"],
  [/\{[^}\n]*activeJobContext\s*\(/, "{activeJobContext(...)} in JSX"],
  [/\{[^}\n]*withActiveJobContext\s*\(/, "{withActiveJobContext(...)} in JSX"],
  [/\{[^}\n]*\.context[^}\n]*\}/, "JSX expression involving .context"],
  [/\{[^}\n]*requiredSkills[^}\n]*\}/, "JSX expression involving requiredSkills"],
  [/\{[^}\n]*preferredSkills[^}\n]*\}/, "JSX expression involving preferredSkills"],
  [/\{[^}\n]*\.payload[^}\n]*\}/, "JSX expression involving .payload"],
  [/return\s*\(\s*\{\s*\}\s*\)/, "return ({})"],
  [/return\s+\{\s*\}/, "return {}"],
];

let hits = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (const [re, label] of patterns) {
    if (re.test(line)) {
      hits++;
      console.log(`${i + 1}: [${label}] ${line.trim().slice(0, 160)}`);
      break;
    }
  }
}
console.log(hits ? `\n${hits} suspicious line(s).` : "\nNo heuristic hits.");
