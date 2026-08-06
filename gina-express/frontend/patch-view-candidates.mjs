#!/usr/bin/env node
/**
 * Fix: Jobs tab "View candidates" shows 0 / empty Board filter.
 *
 * Root cause: View candidates filters with candidate.jobId === job.id.
 * Maria imports often set jobTitle but not the Gina Jobs-tab jobId.
 *
 * ONE LINE:
 *   node gina-express/frontend/patch-view-candidates.mjs ~/lyday-gina-backend/gina-backend
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootArg = String(process.argv[2] || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");
if (!rootArg) {
  console.error(
    "Usage: node patch-view-candidates.mjs ~/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

const root = path.resolve(rootArg);
const ginaDir = fs.existsSync(path.join(root, "frontend", "src", "App.jsx"))
  ? root
  : fs.existsSync(path.join(root, "gina-backend", "frontend", "src", "App.jsx"))
    ? path.join(root, "gina-backend")
    : root;

const appPath = path.join(ginaDir, "frontend", "src", "App.jsx");
if (!fs.existsSync(appPath)) {
  console.error("App.jsx not found:", appPath);
  process.exit(2);
}

function loadEsbuild() {
  try {
    const req = createRequire(
      path.join(ginaDir, "frontend", "node_modules", "esbuild", "package.json"),
    );
    return req("esbuild");
  } catch {
    return null;
  }
}

function canCompile(esbuild, text) {
  if (!esbuild) return { ok: true };
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

let src = fs.readFileSync(appPath, "utf8");
const bak = `${appPath}.bak-view-cands-${Date.now()}`;
fs.copyFileSync(appPath, bak);
const esbuild = loadEsbuild();
const before = canCompile(esbuild, src);
if (!before.ok) {
  console.error("App.jsx does not compile before patch:", before.error);
  process.exit(2);
}

let changed = 0;

// 1) Jobs card counts: also match by job title when jobId is missing/mismatched
const countPatterns = [
  [
    /candidates\.filter\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*\1\.jobId\s*===\s*(\w+)\.id\s*\)\.length/g,
    "candidates.filter(($1) => $1.jobId === $2.id || String($1.jobTitle || $1.role || '').trim().toLowerCase() === String($2.title || '').trim().toLowerCase()).length",
  ],
  [
    /(\w+)\.filter\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*\2\.jobId\s*===\s*(\w+)\.id\s*\)\.length/g,
    "$1.filter(($2) => $2.jobId === $3.id || String($2.jobTitle || $2.role || '').trim().toLowerCase() === String($3.title || '').trim().toLowerCase()).length",
  ],
];
for (const [re, to] of countPatterns) {
  const next = src.replace(re, to);
  if (next !== src) {
    src = next;
    changed += 1;
    console.log("Patched Jobs candidate count to include title match");
  }
}

// Common minified-style in source App.jsx before build:
if (src.includes("u.jobId===o.id") || src.includes("u.jobId === o.id")) {
  const next = src
    .replace(
      /u\.jobId\s*===\s*o\.id\s*&&\s*u\.stage\s*===\s*["']hired["']/g,
      "(u.jobId===o.id || String(u.jobTitle||u.role||'').trim().toLowerCase()===String(o.title||'').trim().toLowerCase()) && u.stage===\"hired\"",
    )
    .replace(
      /u\.jobId\s*===\s*o\.id/g,
      "(u.jobId===o.id || String(u.jobTitle||u.role||'').trim().toLowerCase()===String(o.title||'').trim().toLowerCase())",
    );
  if (next !== src) {
    src = next;
    changed += 1;
    console.log("Patched u.jobId===o.id title fallback");
  }
}

// 2) Board job filter: when a job id is selected, also show title matches
// h==="none"?!_.jobId:_.jobId===h  OR similar readable source
const filterReplacements = [
  [
    /(\w+)\s*===\s*["']none["']\s*\?\s*!\s*(\w+)\.jobId\s*:\s*\2\.jobId\s*===\s*\1/g,
    '$1==="none"?!$2.jobId:($2.jobId===$1 || (Array.isArray(jobs)&&jobs.some(j=>j.id===$1&&String($2.jobTitle||$2.role||"").trim().toLowerCase()===String(j.title||"").trim().toLowerCase())))',
  ],
];
for (const [re, to] of filterReplacements) {
  const next = src.replace(re, to);
  if (next !== src) {
    src = next;
    changed += 1;
    console.log("Patched Board jobId filter with title fallback");
  }
}

// Readable source variants for board filter helpers
if (
  src.includes("jobId === boardJobFilter") ||
  src.includes("jobId===boardJobFilter") ||
  src.includes('boardJobFilter === "none"')
) {
  const next = src.replace(
    /c\.jobId\s*===\s*boardJobFilter/g,
    '(c.jobId===boardJobFilter || (Array.isArray(jobs)&&jobs.some(j=>j.id===boardJobFilter&&String(c.jobTitle||c.role||"").trim().toLowerCase()===String(j.title||"").trim().toLowerCase())))',
  );
  if (next !== src) {
    src = next;
    changed += 1;
    console.log("Patched boardJobFilter title fallback");
  }
}

// 3) Boot/link effect: attach Gina jobId onto Board cards by matching title
if (!src.includes("__ginaLinkCandidatesToJobs")) {
  const jobsState = src.search(
    /const\s*\[\s*jobs\s*,\s*setJobs\s*\]\s*=\s*useState\s*\(/,
  );
  if (jobsState >= 0 && /setCandidates/.test(src) && /useEffect/.test(src)) {
    const open = src.indexOf("(", jobsState);
    let depth = 0;
    let end = -1;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    while (
      end > 0 &&
      (src[end] === ";" || src[end] === "\n" || src[end] === "\r")
    ) {
      if (src[end] === ";") {
        end += 1;
        break;
      }
      end += 1;
    }
    if (end > 0) {
      const inject = `
  useEffect(() => {
    // View candidates needs candidate.jobId === job.id
    try {
      setCandidates((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        const jobList = Array.isArray(jobs) ? jobs : [];
        if (!jobList.length || !list.length) return list;
        let dirty = false;
        const next = list.map((c) => {
          if (!c) return c;
          if (c.jobId && jobList.some((j) => j && j.id === c.jobId)) return c;
          const title = String(c.jobTitle || c.role || "")
            .trim()
            .toLowerCase();
          if (!title) return c;
          const job = jobList.find(
            (j) =>
              String(j?.title || j?.name || "")
                .trim()
                .toLowerCase() === title,
          );
          if (!job?.id) return c;
          dirty = true;
          return { ...c, jobId: job.id, jobTitle: c.jobTitle || job.title };
        });
        return dirty ? next : list;
      });
    } catch (e) { /* ignore */ }
  }, [jobs]);
  if (typeof window !== "undefined") window.__ginaLinkCandidatesToJobs = true;
`;
      src = src.slice(0, end) + inject + src.slice(end);
      changed += 1;
      console.log("Injected candidate↔jobId link useEffect for View candidates");
    }
  }
}

const after = canCompile(esbuild, src);
if (!after.ok) {
  console.error("REFUSING: App.jsx would not compile:", after.error);
  fs.copyFileSync(bak, appPath);
  process.exit(2);
}

fs.writeFileSync(appPath, src, "utf8");
console.log("Wrote", appPath, "changes:", changed);
console.log("Backup:", bak);

// Refresh applyAgentAction (explicit jobId on Maria imports + linkBoardCandidatesToJob)
const check = spawnSync(
  process.execPath,
  [path.join(__dirname, "patch-check-for-actions.mjs"), ginaDir],
  { stdio: "inherit" },
);
if (check.status !== 0) {
  console.error("patch-check-for-actions failed:", check.status);
  process.exit(check.status || 2);
}

console.log(`
Next:
  cd ${path.join(ginaDir, "frontend")} && npm run build
  git add -f frontend/dist frontend/src/App.jsx
  git commit -m "Fix Jobs View candidates: link Board cards by jobId"
  git push

Then hard-refresh → Jobs → View candidates should show Maria's shortlist.
`);
