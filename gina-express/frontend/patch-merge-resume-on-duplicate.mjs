#!/usr/bin/env node
/**
 * When import_candidate hits a duplicate, merge resumeText/role onto the
 * existing board card instead of skipping.
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

const OLD = `if (existing) {
          return {
            ok: true,
            summary: \`Skipped duplicate: \${payload.name} (already on board as \${existing.name})\`,
          };
        }`;

const NEW = `if (existing) {
          const resumeText =
            payload.resumeText || payload.resume_text || payload.summary || "";
          const role = payload.jobTitle || payload.role || existing.role || "";
          if (typeof updateCandidate === "function") {
            updateCandidate(existing.id, {
              resumeText: resumeText || existing.resumeText || existing.resume_text || "",
              summary: payload.summary || existing.summary || "",
              headline: payload.headline || existing.headline || "",
              role,
              jobTitle: payload.jobTitle || existing.jobTitle || "",
              source: existing.source || payload.source || "SignalHire",
            });
            return {
              ok: true,
              summary: \`Updated \${existing.name} with resume/role from import\`,
            };
          }
          return {
            ok: true,
            summary: \`Skipped duplicate: \${payload.name} (already on board as \${existing.name})\`,
          };
        }`;

if (src.includes("Updated ${existing.name} with resume/role from import") ||
    src.includes("Updated ${existing.name} with resume/role") ||
    /Updated \$\{existing\.name\} with resume\/role from import/.test(src)) {
  console.log("Merge-on-duplicate already present");
} else if (src.includes("Skipped duplicate:")) {
  // Flexible replace of the existing-block return
  const re =
    /if\s*\(\s*existing\s*\)\s*\{\s*return\s*\{\s*ok:\s*true,\s*summary:\s*`Skipped duplicate:\$\{payload\.name\} \(already on board as \$\{existing\.name\}\)`\s*,?\s*\};\s*\}/;
  const re2 =
    /if\s*\(\s*existing\s*\)\s*\{\s*return\s*\{\s*ok:\s*true,\s*summary:\s*`Skipped duplicate: \$\{payload\.name\} \(already on board as \$\{existing\.name\}\)`\s*,?\s*\};\s*\}/;
  if (re2.test(src)) {
    src = src.replace(re2, NEW);
    console.log("Patched duplicate skip → merge resume (re2)");
  } else if (src.includes(OLD)) {
    src = src.replace(OLD, NEW);
    console.log("Patched duplicate skip → merge resume (exact)");
  } else {
    // looser: find Skipped duplicate block
    const idx = src.indexOf("Skipped duplicate:");
    if (idx < 0) {
      console.error("Could not find Skipped duplicate block");
      process.exit(1);
    }
    // walk back to "if (existing)"
    const start = src.lastIndexOf("if (existing)", idx);
    const end = src.indexOf("}", src.indexOf("}", idx) + 1) + 1;
    if (start < 0 || end <= start) {
      console.error("Could not bound existing-duplicate block");
      process.exit(1);
    }
    src = src.slice(0, start) + NEW + src.slice(end);
    console.log("Patched duplicate skip → merge resume (bounded)");
  }
} else {
  console.error("No Skipped duplicate logic found");
  process.exit(1);
}

fs.writeFileSync(target, src, "utf8");
console.log("Backup:", bak);
console.log(`
Next:
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend/gina-backend
  git add frontend/src/App.jsx
  git commit -m "Merge resumeText onto existing candidates on re-import"
  git push origin main
`);
