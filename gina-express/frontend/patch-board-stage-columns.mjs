#!/usr/bin/env node
/**
 * Patch Gina App.jsx so Board columns use normalized stage keys.
 * Cards with stage "Rejected" / "interviewing" / "Phone Screen" slide under
 * the correct column instead of sticking in New / Screening.
 *
 * Usage:
 *   node gina-express/frontend/patch-board-stage-columns.mjs ~/lyday-gina-backend
 */
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2] || process.env.GINA_ROOT || "";
if (!root) {
  console.error("Usage: node patch-board-stage-columns.mjs <gina-root>");
  process.exit(1);
}

const candidates = [
  path.join(root, "gina-backend/frontend/src/App.jsx"),
  path.join(root, "frontend/src/App.jsx"),
  path.join(root, "gina-backend/frontend/App.jsx"),
  path.join(root, "App.jsx"),
];
const appPath = candidates.find((p) => fs.existsSync(p));
if (!appPath) {
  console.error("App.jsx not found under", root);
  process.exit(1);
}

let src = fs.readFileSync(appPath, "utf8");
const before = src;

const helper = `
function __ginaBoardColumnKey(raw) {
  let s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[→➞]/g, " ")
    .replace(/[\\\\s-]+/g, "_")
    .replace(/_+/g, "_");
  if (!s) return "new";
  if (
    s === "phone_screen" ||
    s === "phonescreen" ||
    s === "pre_screen" ||
    s === "prescreen" ||
    s === "screen" ||
    s === "phone"
  )
    return "screening";
  if (
    s === "interviewing" ||
    s === "interviews" ||
    s === "on_site" ||
    s === "onsite" ||
    s === "final"
  )
    return "interview";
  if (s === "reject" || s === "rejection" || s === "declined" || s === "pass")
    return "rejected";
  if (s === "hire") return "hired";
  if (s === "offered") return "offer";
  const allowed = ["new", "screening", "interview", "offer", "hired", "rejected"];
  return allowed.includes(s) ? s : "new";
}
`;

if (!/function\s+__ginaBoardColumnKey\b/.test(src)) {
  // Insert before STAGES or before first function applyAgentAction
  const markers = [
    /(?:const|let|var)\s+STAGES\s*=/,
    /function\s+applyAgentAction\s*\(/,
    /function\s+App\s*\(/,
  ];
  let inserted = false;
  for (const re of markers) {
    const m = src.match(re);
    if (m && m.index != null) {
      src = src.slice(0, m.index) + helper + "\n" + src.slice(m.index);
      inserted = true;
      console.log("Inserted __ginaBoardColumnKey before", m[0].slice(0, 40));
      break;
    }
  }
  if (!inserted) {
    src = helper + "\n" + src;
    console.log("Prepended __ginaBoardColumnKey");
  }
}

// Rewrite common column filters to use normalized keys
const replacements = [
  [
    /\.filter\(\s*\(?\s*([cCuU])\s*\)?\s*=>\s*\1\.stage\s*===\s*([a-zA-Z_][\w.]*)\.key\s*\)/g,
    ".filter(($1) => __ginaBoardColumnKey($1.stage) === $2.key)",
  ],
  [
    /\.filter\(\s*\(?\s*([cCuU])\s*\)?\s*=>\s*\1\.stage\s*===\s*stage\.key\s*\)/g,
    ".filter(($1) => __ginaBoardColumnKey($1.stage) === stage.key)",
  ],
  [
    /\.filter\(\s*\(?\s*([cCuU])\s*\)?\s*=>\s*\1\.stage\s*===\s*s\.key\s*\)/g,
    ".filter(($1) => __ginaBoardColumnKey($1.stage) === s.key)",
  ],
  // Ternary / inline comparisons used in Board maps
  [
    /([cCuU])\.stage\s*===\s*([a-zA-Z_][\w.]*)\.key/g,
    "__ginaBoardColumnKey($1.stage) === $2.key",
  ],
];

let changedFilters = 0;
for (const [re, rep] of replacements) {
  const next = src.replace(re, (...args) => {
    changedFilters += 1;
    // args: match, ...groups, offset, string
    if (typeof rep === "string") {
      return rep.replace(/\$(\d+)/g, (_, n) => args[Number(n)] ?? "");
    }
    return rep;
  });
  src = next;
}

// Also normalize inside setStage if present
if (
  /function\s+setStage\s*\(/.test(src) &&
  !/__ginaBoardColumnKey\(/.test(
    src.slice(src.search(/function\s+setStage\s*\(/), src.search(/function\s+setStage\s*\(/) + 400),
  )
) {
  src = src.replace(
    /function\s+setStage\s*\(\s*id\s*,\s*stage\s*\)\s*\{/,
    `function setStage(id, stage) {
  stage = __ginaBoardColumnKey(stage);`,
  );
  console.log("Wrapped setStage to normalize stage keys");
}

if (src === before) {
  console.log("No Board column filter changes needed (or patterns not found)");
  if (/__ginaBoardColumnKey/.test(src)) {
    console.log("Helper already present");
  }
} else {
  fs.writeFileSync(appPath, src);
  console.log("Patched", appPath, "filterHits≈", changedFilters);
}
