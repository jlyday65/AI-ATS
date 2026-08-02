#!/usr/bin/env node
/**
 * Fix: Skipped action N: 5 candidates share that name — ask Gina to match by email instead.
 *
 * Replaces findCandidateByMatch to prefer email / phone / id / jobTitle before name,
 * and teaches update_stage / add_note to pass email from the action payload.
 *
 * ONE LINE:
 *   node gina-express/frontend/patch-find-candidate-match.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 *   cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
 */

import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { resolveAppJsxPath } from "./notes-toolbar-markup.mjs";

const target = resolveAppJsxPath(process.argv);
if (!target || !fs.existsSync(target)) {
  console.error(
    "Usage: node patch-find-candidate-match.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx",
  );
  process.exit(1);
}

function loadEsbuild(appFile) {
  const frontend = path.resolve(path.dirname(appFile), "..");
  try {
    const req = createRequire(
      path.join(frontend, "node_modules", "esbuild", "package.json"),
    );
    return req("esbuild");
  } catch {
    return null;
  }
}

function canCompile(esbuild, text) {
  if (!esbuild) return { ok: false, error: "esbuild missing" };
  try {
    esbuild.transformSync(text, {
      loader: "jsx",
      jsx: "automatic",
      logLevel: "silent",
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.errors?.[0]?.text || e.message || e) };
  }
}

function braceEnd(src, openIdx) {
  if (openIdx < 0 || src[openIdx] !== "{") return -1;
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

const FIND_FN = `
  function findCandidateByMatch(match) {
    if (!match || typeof match !== "object") return null;
    const list = Array.isArray(candidates) ? candidates : [];
    const email = String(match.email || "").trim().toLowerCase();
    const phone = String(match.phone || "").replace(/\\D/g, "");
    const id = String(match.id || match.candidateId || "").trim();
    const name = String(match.name || match.fullName || "").trim().toLowerCase();
    const jobTitle = String(
      match.jobTitle || match.role || match.job || "",
    )
      .trim()
      .toLowerCase();

    if (id) {
      const byId = list.find((c) => String(c.id) === id);
      if (byId) return byId;
    }

    if (email) {
      const byEmail = list.filter(
        (c) => (c.email || "").trim().toLowerCase() === email,
      );
      if (byEmail.length === 1) return byEmail[0];
      if (byEmail.length > 1) {
        return {
          ambiguous: true,
          count: byEmail.length,
          name: byEmail[0]?.name || email,
        };
      }
    }

    if (phone) {
      const byPhone = list.filter(
        (c) => (c.phone || "").replace(/\\D/g, "") === phone,
      );
      if (byPhone.length === 1) return byPhone[0];
    }

    if (!name) return null;

    let hits = list.filter(
      (c) => (c.name || "").trim().toLowerCase() === name,
    );
    if (!hits.length) return null;

    if (hits.length > 1 && jobTitle) {
      const narrowed = hits.filter((c) => {
        const role = (c.role || "").trim().toLowerCase();
        const jt = (c.jobTitle || "").trim().toLowerCase();
        return role === jobTitle || jt === jobTitle;
      });
      if (narrowed.length === 1) return narrowed[0];
      if (narrowed.length > 1) hits = narrowed;
    }

    // Prefer the card that already has an email when names collide and match has none.
    if (hits.length > 1) {
      const withEmail = hits.filter((c) => (c.email || "").trim());
      if (withEmail.length === 1) return withEmail[0];
    }

    if (hits.length === 1) return hits[0];
    return {
      ambiguous: true,
      count: hits.length,
      name: hits[0]?.name || name,
      emails: hits
        .map((c) => (c.email || "").trim())
        .filter(Boolean)
        .slice(0, 8),
    };
  }
`.trim();

function enrichMatchCalls(src) {
  // Prefer email/phone/jobTitle from payload when resolving board cards.
  return src.replace(
    /const match = findCandidateByMatch\(\s*payload\?\.match\s*\);/g,
    `const match = findCandidateByMatch({
          ...(payload?.match || {}),
          email: payload?.match?.email || payload?.email || "",
          phone: payload?.match?.phone || payload?.phone || "",
          jobTitle:
            payload?.match?.jobTitle ||
            payload?.match?.role ||
            payload?.jobTitle ||
            payload?.role ||
            "",
        });`,
  );
}

function improveAmbiguousReason(src) {
  return src.replace(
    /\$\{match\.count\} candidates share that name — ask Gina to match by email instead\./g,
    "${match.count} candidates share that name — re-queue with match.email, or clear duplicate names on the Board.",
  );
}

const esbuild = loadEsbuild(target);
let src = fs.readFileSync(target, "utf8");
const before = canCompile(esbuild, src);
if (!before.ok) {
  console.error("App.jsx does not compile:", before.error);
  process.exit(2);
}

const bak = `${target}.bak-find-match-${Date.now()}`;
fs.copyFileSync(target, bak);

const findAt = src.search(/function\s+findCandidateByMatch\b/);
if (findAt < 0) {
  // Insert before applyAgentAction if present
  const appAt = src.search(/(?:async\s+)?function\s+applyAgentAction\b/);
  if (appAt < 0) {
    console.error("Could not find findCandidateByMatch or applyAgentAction");
    process.exit(2);
  }
  src = src.slice(0, appAt) + FIND_FN + "\n\n" + src.slice(appAt);
  console.log("Inserted findCandidateByMatch before applyAgentAction");
} else {
  const braceAt = src.indexOf("{", findAt);
  const end = braceEnd(src, braceAt);
  if (end < 0) {
    console.error("Could not bound findCandidateByMatch");
    process.exit(2);
  }
  src = src.slice(0, findAt) + FIND_FN + src.slice(end);
  console.log("Replaced findCandidateByMatch");
}

src = enrichMatchCalls(src);
src = improveAmbiguousReason(src);

const after = canCompile(esbuild, src);
if (!after.ok) {
  console.error("Patched App.jsx failed compile:", after.error);
  fs.copyFileSync(bak, target);
  process.exit(2);
}

fs.writeFileSync(target, src, "utf8");
console.log("OK: board match prefers email/phone/jobTitle");
console.log("Backup:", path.basename(bak));
console.log(`
Next:
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend
  git add gina-backend/frontend/src/App.jsx
  git commit -m "Disambiguate board match by email/phone/jobTitle"
  git push origin main
`);
