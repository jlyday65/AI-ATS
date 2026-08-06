#!/usr/bin/env node
/**
 * Prevent Check for actions from adding the same person twice.
 * Safe against ReferenceError: beginCandidateImportSession is not defined
 * (helpers may be missing from App.jsx when only the call sites were patched).
 *
 * Usage:
 *   node gina-express/frontend/patch-no-duplicate-candidates.mjs ~/lyday-gina-backend/gina-backend
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || ".");
const appPath = path.join(root, "frontend", "src", "App.jsx");
if (!fs.existsSync(appPath)) {
  console.error("App.jsx not found:", appPath);
  process.exit(1);
}

let src = fs.readFileSync(appPath, "utf8");
const before = src;

const helperBlock = `
function candidateIdentityKey(c) {
  if (!c || typeof c !== "object") return "";
  const email = String(c.email || "").trim().toLowerCase();
  if (email) return \`email:\${email}\`;
  const linkedin = String(c.linkedin || "").trim().toLowerCase().replace(/\\/$/, "");
  if (linkedin) return \`li:\${linkedin}\`;
  const name = String(c.name || "").trim().toLowerCase().replace(/\\s+/g, " ");
  const title = String(c.title || "").trim().toLowerCase().replace(/\\s+/g, " ");
  if (name) return \`name:\${name}|\${title}\`;
  return String(c.id || "").trim();
}

function mergeCandidateKeepRicher(a, b) {
  if (!a) return b;
  if (!b) return a;
  const score = (c) =>
    [c.email, c.phone, c.linkedin, c.summary, c.experience, c.skills, c.education, c.notes]
      .filter(Boolean)
      .reduce((n, v) => n + String(v).length, 0) + (Array.isArray(c.tags) ? c.tags.length : 0);
  const keep = score(a) >= score(b) ? a : b;
  const other = keep === a ? b : a;
  return {
    ...other,
    ...keep,
    id: keep.id || other.id,
    stage: keep.stage || other.stage,
    tags: Array.from(new Set([...(Array.isArray(other.tags) ? other.tags : []), ...(Array.isArray(keep.tags) ? keep.tags : [])])),
    notes: [other.notes, keep.notes].filter(Boolean).join("\\n\\n").trim() || keep.notes || other.notes || "",
    updatedAt: keep.updatedAt || other.updatedAt || new Date().toISOString(),
  };
}

function dedupeCandidateList(list) {
  const out = [];
  const seen = new Map();
  for (const c of Array.isArray(list) ? list : []) {
    const key = candidateIdentityKey(c);
    if (!key) {
      out.push(c);
      continue;
    }
    if (!seen.has(key)) {
      seen.set(key, out.length);
      out.push(c);
      continue;
    }
    const idx = seen.get(key);
    out[idx] = mergeCandidateKeepRicher(out[idx], c);
  }
  return out;
}

function beginCandidateImportSession() {
  if (typeof window !== "undefined") {
    window.__ginaImportSessionKeys = new Set();
  }
}

function markCandidateImportedThisSession(c) {
  if (typeof window === "undefined") return false;
  if (!(window.__ginaImportSessionKeys instanceof Set)) {
    window.__ginaImportSessionKeys = new Set();
  }
  const key = candidateIdentityKey(c);
  if (!key) return false;
  if (window.__ginaImportSessionKeys.has(key)) return true;
  window.__ginaImportSessionKeys.add(key);
  return false;
}

if (typeof window !== "undefined") {
  window.beginCandidateImportSession = beginCandidateImportSession;
  window.markCandidateImportedThisSession = markCandidateImportedThisSession;
  window.candidateIdentityKey = candidateIdentityKey;
  window.mergeCandidateKeepRicher = mergeCandidateKeepRicher;
  window.dedupeCandidateList = dedupeCandidateList;
}
`;

if (!src.includes("function candidateIdentityKey(")) {
  const marker = "export default function App()";
  const idx = src.indexOf(marker);
  if (idx === -1) {
    console.error("Could not find App() export to inject helpers.");
    process.exit(1);
  }
  src = src.slice(0, idx) + helperBlock + "\n" + src.slice(idx);
  console.log("Injected candidate dedupe helpers + window exports");
} else {
  if (!src.includes("window.beginCandidateImportSession")) {
    const anchor = "function markCandidateImportedThisSession(c) {";
    const i = src.indexOf(anchor);
    if (i !== -1) {
      const end = src.indexOf("\n}", i);
      if (end !== -1) {
        const insertAt = end + 2;
        src =
          src.slice(0, insertAt) +
          `
if (typeof window !== "undefined") {
  window.beginCandidateImportSession = beginCandidateImportSession;
  window.markCandidateImportedThisSession = markCandidateImportedThisSession;
  window.candidateIdentityKey = candidateIdentityKey;
  window.mergeCandidateKeepRicher = mergeCandidateKeepRicher;
  window.dedupeCandidateList = dedupeCandidateList;
}
` +
          src.slice(insertAt);
        console.log("Exported beginCandidateImportSession on window");
      }
    }
  } else {
    console.log("Dedupe helpers already present");
  }
}

const beginSafe =
  "if (typeof beginCandidateImportSession === \"function\") beginCandidateImportSession();\n" +
  "            else if (typeof window !== \"undefined\" && typeof window.beginCandidateImportSession === \"function\") window.beginCandidateImportSession();";
if (src.includes("beginCandidateImportSession()") && !src.includes('typeof beginCandidateImportSession === "function"')) {
  src = src.split("beginCandidateImportSession();").join(beginSafe);
  console.log("Wrapped beginCandidateImportSession calls with typeof guards");
}

if (
  src.includes("const alreadyImportedThisBatch = markCandidateImportedThisSession(candidate);") &&
  !src.includes("typeof markCandidateImportedThisSession ===")
) {
  src = src.replace(
    "const alreadyImportedThisBatch = markCandidateImportedThisSession(candidate);",
    `const alreadyImportedThisBatch =
              typeof markCandidateImportedThisSession === "function"
                ? markCandidateImportedThisSession(candidate)
                : typeof window !== "undefined" && typeof window.markCandidateImportedThisSession === "function"
                  ? window.markCandidateImportedThisSession(candidate)
                  : false;`
  );
  console.log("Hardened markCandidateImportedThisSession call");
}

const staleBlock = `const exists = candidates.some(
            (c) =>
              (candidate.email && c.email && c.email.toLowerCase() === candidate.email.toLowerCase()) ||
              (candidate.linkedin && c.linkedin && c.linkedin === candidate.linkedin) ||
              (c.name === candidate.name && c.title === candidate.title)
          );
          if (!exists) {
            setCandidates((prev) => [candidate, ...prev]);
            imported += 1;
          }`;

const dedupeBlock = `const alreadyImportedThisBatch =
              typeof markCandidateImportedThisSession === "function"
                ? markCandidateImportedThisSession(candidate)
                : typeof window !== "undefined" && typeof window.markCandidateImportedThisSession === "function"
                  ? window.markCandidateImportedThisSession(candidate)
                  : false;
          if (alreadyImportedThisBatch) {
            // Same person already added earlier in this Check for actions batch — skip.
          } else {
            setCandidates((prev) => {
              const exists = prev.some((c) => {
                const a = typeof candidateIdentityKey === "function" ? candidateIdentityKey(c) : "";
                const b = typeof candidateIdentityKey === "function" ? candidateIdentityKey(candidate) : "";
                if (a && b && a === b) return true;
                return (
                  (candidate.email && c.email && c.email.toLowerCase() === candidate.email.toLowerCase()) ||
                  (candidate.linkedin && c.linkedin && c.linkedin === candidate.linkedin) ||
                  (c.name === candidate.name && c.title === candidate.title)
                );
              });
              if (exists) {
                return prev.map((c) => {
                  const a = typeof candidateIdentityKey === "function" ? candidateIdentityKey(c) : "";
                  const b = typeof candidateIdentityKey === "function" ? candidateIdentityKey(candidate) : "";
                  const same =
                    (a && b && a === b) ||
                    (candidate.email && c.email && c.email.toLowerCase() === candidate.email.toLowerCase()) ||
                    (candidate.linkedin && c.linkedin && c.linkedin === candidate.linkedin) ||
                    (c.name === candidate.name && c.title === candidate.title);
                  if (!same) return c;
                  return typeof mergeCandidateKeepRicher === "function"
                    ? mergeCandidateKeepRicher(c, candidate)
                    : { ...c, ...candidate, id: c.id };
                });
              }
              imported += 1;
              return [candidate, ...prev];
            });
          }`;

if (src.includes(staleBlock)) {
  src = src.replace(staleBlock, dedupeBlock);
  console.log("Patched Check for actions import to use functional setState + session dedupe");
} else if (src.includes("alreadyImportedThisBatch")) {
  console.log("Import dedupe already patched (or nearby code changed)");
} else {
  console.warn("WARNING: could not find exact import exists-block — helpers were still injected");
}

if (
  src.includes("setCandidates((prev) => [candidate, ...prev].slice(0, 500));") &&
  !src.includes("dedupeCandidateList(prev)")
) {
  src = src.replace(
    "setCandidates((prev) => [candidate, ...prev].slice(0, 500));",
    `setCandidates((prev) => {
                        const key = typeof candidateIdentityKey === "function" ? candidateIdentityKey(candidate) : "";
                        const exists = prev.some((c) => {
                          const ck = typeof candidateIdentityKey === "function" ? candidateIdentityKey(c) : "";
                          return (key && ck && key === ck) || c.id === candidate.id;
                        });
                        if (exists) {
                          return prev.map((c) => {
                            const ck = typeof candidateIdentityKey === "function" ? candidateIdentityKey(c) : "";
                            const same = (key && ck && key === ck) || c.id === candidate.id;
                            if (!same) return c;
                            return typeof mergeCandidateKeepRicher === "function"
                              ? mergeCandidateKeepRicher(c, candidate)
                              : { ...c, ...candidate, id: c.id };
                          }).slice(0, 500);
                        }
                        return [candidate, ...prev].slice(0, 500);
                      });`
  );
  console.log("Patched single-candidate agent import path");
}

if (src.includes("setCandidates(data.candidates || [])") && !src.includes("dedupeCandidateList(data.candidates")) {
  src = src.replace(
    "setCandidates(data.candidates || [])",
    `setCandidates(typeof dedupeCandidateList === "function" ? dedupeCandidateList(data.candidates || []) : (data.candidates || []))`
  );
  console.log("Patched board load to dedupe existing rows");
}

if (src === before) {
  console.log("No textual changes (already up to date)");
} else {
  fs.writeFileSync(appPath, src);
  console.log("Wrote", appPath);
}

console.log(`
Next:
  cd ${path.join(root, "frontend")} && npm run build
  # commit App.jsx + dist, push, Railway redeploy, hard-refresh Gina
`);
