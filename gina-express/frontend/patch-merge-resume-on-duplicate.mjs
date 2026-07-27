#!/usr/bin/env node
/**
 * When import_candidate hits a duplicate, merge resumeText/role onto the
 * existing board card via setCandidates (Gina has no updateCandidate helper).
 *
 * Usage:
 *   node /tmp/patch-merge-resume-on-duplicate.mjs \
 *     /Users/jameslyday/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 */

import fs from "fs";
import path from "path";

const target = path.resolve(
  String(process.argv[2] || "").replace(/^~/, process.env.HOME || ""),
);
if (!fs.existsSync(target)) {
  console.error("Usage: node /tmp/patch-merge-resume-on-duplicate.mjs /Users/.../App.jsx");
  process.exit(1);
}

let src = fs.readFileSync(target, "utf8");
const bak = `${target}.bak-merge-${Date.now()}`;
fs.copyFileSync(target, bak);

const NEW = `if (existing) {
          // Merge resume/role — CandidateTracker uses setCandidates, not updateCandidate.
          const resumeText =
            payload.resumeText || payload.resume_text || payload.summary || "";
          const role = payload.jobTitle || payload.role || existing.role || "";
          const patch = {
            resumeText: resumeText || existing.resumeText || existing.resume_text || "",
            summary: payload.summary || existing.summary || "",
            headline: payload.headline || existing.headline || "",
            role,
            jobTitle: payload.jobTitle || existing.jobTitle || "",
            source: existing.source || payload.source || "SignalHire",
          };
          if (typeof updateCandidate === "function") {
            updateCandidate(existing.id, patch);
          } else if (typeof setCandidates === "function") {
            setCandidates((prev) =>
              (prev || []).map((c) =>
                c.id === existing.id ? { ...c, ...patch } : c,
              ),
            );
          } else {
            return {
              ok: false,
              reason: \`Duplicate \${existing.name} found but board has no setCandidates/updateCandidate to merge resume.\`,
            };
          }
          return {
            ok: true,
            summary: \`Updated \${existing.name} with resume/role from import\`,
          };
        }`;

function alreadyGood(s) {
  return (
    /setCandidates\s*\(\s*\(prev\)/.test(s) &&
    /Updated \$\{existing\.name\} with resume\/role from import/.test(s) &&
    !/Skipped duplicate:/.test(s)
  );
}

if (alreadyGood(src)) {
  console.log("Merge-on-duplicate via setCandidates already present");
  process.exit(0);
}

// Replace any existing-duplicate block that still skips OR only checks updateCandidate.
const blockRe =
  /if\s*\(\s*existing\s*\)\s*\{[\s\S]*?(?:Skipped duplicate:|Updated \$\{existing\.name\} with resume\/role)[\s\S]*?\n\s*\}/;

if (blockRe.test(src)) {
  src = src.replace(blockRe, NEW);
  console.log("Patched duplicate block → merge via setCandidates");
} else if (src.includes("Skipped duplicate:")) {
  const idx = src.indexOf("Skipped duplicate:");
  const start = src.lastIndexOf("if (existing)", idx);
  // Find matching closing brace for the if (existing) block
  let i = src.indexOf("{", start);
  let depth = 0;
  let end = -1;
  for (; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (start < 0 || end <= start) {
    console.error("Could not bound existing-duplicate block");
    process.exit(1);
  }
  src = src.slice(0, start) + NEW + src.slice(end);
  console.log("Patched duplicate skip → merge via setCandidates (bounded)");
} else {
  console.error("No duplicate-import logic found to patch");
  process.exit(1);
}

if (/Skipped duplicate:/.test(src) && /import_candidate|create_candidate/.test(src)) {
  console.warn(
    "WARN: 'Skipped duplicate' still appears somewhere — search App.jsx and remove fallback skips.",
  );
}

fs.writeFileSync(target, src, "utf8");
console.log("Backup:", bak);
console.log(`
Next:
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend/gina-backend
  git add frontend/src/App.jsx
  git commit -m "Merge resume/role onto duplicates via setCandidates"
  git push origin main
`);
