#!/usr/bin/env node
/**
 * Fix React minified error #31:
 *   Objects are not valid as a React child (found: object with keys {})
 *
 * Common Gina causes after Jobs-tab upsert:
 *   - selectedJob state is {} and JSX does `{selectedJob || …}`
 *   - job.requiredSkills / context stored as {}
 *   - setSelectedJob(fullJob) when state expects an id string
 *
 *   node gina-express/frontend/fix-react-31.mjs ~/lyday-gina-backend/gina-backend
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootArg = String(process.argv[2] || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");
if (!rootArg) {
  console.error("Usage: node fix-react-31.mjs ~/lyday-gina-backend/gina-backend");
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

const SANITIZE_HELPER = `
function sanitizeGinaJob(job) {
  if (!job || typeof job !== "object") return null;
  const asSkills = (v) => {
    if (Array.isArray(v)) {
      return v
        .map((x) =>
          typeof x === "string"
            ? x
            : x && typeof x === "object"
              ? String(x.name || x.label || x.skill || "")
              : String(x || ""),
        )
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (typeof v === "string" && v.trim()) {
      return v.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    }
    return [];
  };
  const title = String(job.title || job.name || "").trim();
  if (!title) return null;
  return {
    id: job.id || \`job_\${Date.now().toString(36)}\`,
    title,
    name: String(job.name || title),
    location: String(job.location || ""),
    description: String(job.description || job.jobDescription || ""),
    jobDescription: String(job.jobDescription || job.description || ""),
    requiredSkills: asSkills(job.requiredSkills),
    preferredSkills: asSkills(job.preferredSkills),
    status: String(job.status || "open"),
    source: job.source != null ? String(job.source) : undefined,
    createdAt: job.createdAt || undefined,
    updatedAt: job.updatedAt || undefined,
  };
}

function sanitizeGinaJobsList(list) {
  if (!Array.isArray(list)) return [];
  return list.map(sanitizeGinaJob).filter(Boolean);
}

/** Never render a plain object as a React child. */
function ginaText(value) {
  if (value == null || value === false) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(ginaText).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    try {
      if (value.name || value.title || value.label) {
        return String(value.name || value.title || value.label);
      }
    } catch { /* ignore */ }
    return "";
  }
  return String(value);
}
`;

let src = fs.readFileSync(appPath, "utf8");
const bak = `${appPath}.bak-react31-${Date.now()}`;
fs.copyFileSync(appPath, bak);
console.log("Backup:", bak);

const esbuild = loadEsbuild();
const before = canCompile(esbuild, src);
if (!before.ok) {
  console.error("App.jsx does not compile before fix:", before.error);
  process.exit(2);
}

// Inject sanitize helpers once (before App) — NEVER as default export
if (!src.includes("function sanitizeGinaJob(")) {
  const marker =
    src.indexOf("export default function App()") >= 0
      ? src.indexOf("export default function App()")
      : src.search(/function\s+(?:App|CandidateTracker)\b/);
  if (marker < 0) {
    console.error("Could not find App()");
    process.exit(2);
  }
  const importAt = src.search(/^import\s/m);
  if (importAt >= 0 && marker < importAt) {
    console.error("REFUSING: App marker above imports");
    process.exit(2);
  }
  src = src.slice(0, marker) + SANITIZE_HELPER + "\n" + src.slice(marker);
  console.log("Injected sanitizeGinaJob / ginaText helpers");
}
// Guard: helpers must never become the module default export
if (/export\s+default\s+function\s+sanitizeGinaJob\b/.test(src)) {
  src = src.replace(
    /export\s+default\s+function\s+sanitizeGinaJob\b/,
    "function sanitizeGinaJob",
  );
  console.log("Fixed mistaken default export on sanitizeGinaJob");
}
if (
  !/export\s+default\s+function\s+App\b/.test(src) &&
  !/export\s+default\s+App\b/.test(src)
) {
  console.error("REFUSING: App.jsx lost `export default function App`");
  process.exit(2);
}

// Fix classic `{selectedJob || …}` / `{activeJob || …}` empty-object render
const beforeSel = src;
src = src.replace(
  /\{(\s*)(selectedJob|activeJob|currentJob)(\s*)\|\|(\s*)/g,
  "{/* react31-safe */}{$1($2 && typeof $2 === \"object\" && !Array.isArray($2) && Object.keys($2).length === 0 ? null : $2)$3||$4",
);
if (src !== beforeSel) {
  console.log("Softened selectedJob/activeJob || fallbacks");
}

// Any JSX child that is literally `|| {}` → `|| null` (React #31 smoking gun)
const beforeEmpty = src;
src = src.replace(/(\|\|\s*)\{\s*\}(\s*)\}/g, "$1null$2}");
src = src.replace(/(\?\s*)\{\s*\}(\s*:)/g, "$1null$2");
if (src !== beforeEmpty) {
  console.log("Replaced || {} / ? {} JSX fallbacks with null");
}

// Soft-replace JSX that dumps requiredSkills / preferredSkills objects
src = src.replace(
  /\{(\s*)((?:job|selectedJob|activeJob|j|currentJob)\.(?:requiredSkills|preferredSkills))(\s*)\}/g,
  "{ginaText($2)}",
);

// Inject one-time jobs sanitizer inside App after jobs state if possible
if (!src.includes("__ginaJobsSanitizedOnce")) {
  const jobsState = src.search(
    /const\s*\[\s*jobs\s*,\s*setJobs\s*\]\s*=\s*useState\s*\(/,
  );
  if (jobsState >= 0) {
    // Insert after the end of this useState(...) call — find matching paren
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
    // skip optional semicolon
    while (end > 0 && (src[end] === ";" || src[end] === "\n" || src[end] === "\r")) {
      if (src[end] === ";") {
        end += 1;
        break;
      }
      end += 1;
    }
    if (end > 0) {
      // Prefer useEffect so we never setState during render
      const inject = `
  useEffect(() => {
    // React #31: purge {} skill/context fields from persisted Jobs
    if (typeof window !== "undefined" && window.__ginaJobsSanitizedOnce) return;
    if (typeof window !== "undefined") window.__ginaJobsSanitizedOnce = true;
    try {
      setJobs((prev) => sanitizeGinaJobsList(prev));
    } catch (e) { /* ignore */ }
  }, []);
`;
      if (!/\buseEffect\b/.test(src.slice(0, 500)) && !/useEffect/.test(src)) {
        console.warn("useEffect not found in App.jsx — skipping boot sanitizer");
      } else {
        src = src.slice(0, end) + inject + src.slice(end);
        console.log("Injected useEffect jobs list sanitizer after useState(jobs)");
      }
    }
  } else {
    console.warn("Could not find const [jobs, setJobs] = useState( — skip boot sanitize");
  }
}

const mid = canCompile(esbuild, src);
if (!mid.ok) {
  console.error("REFUSING: App.jsx would not compile:", mid.error);
  fs.copyFileSync(bak, appPath);
  process.exit(2);
}

fs.writeFileSync(appPath, src, "utf8");

// Refresh applyAgentAction (safer upsert: normalize skills, select by id)
const check = spawnSync(
  process.execPath,
  [path.join(__dirname, "patch-check-for-actions.mjs"), ginaDir],
  { stdio: "inherit" },
);
if (check.status !== 0) {
  console.warn("patch-check-for-actions exited", check.status);
}

src = fs.readFileSync(appPath, "utf8");
const after = canCompile(esbuild, src);
if (!after.ok) {
  console.error("REFUSING final compile:", after.error);
  process.exit(2);
}

console.log(`
OK: React #31 hardening applied.

Also clear bad persisted Jobs once in the browser console if still red:
  localStorage.clear(); sessionStorage.clear(); location.reload();

Then:
  cd ${path.join(ginaDir, "frontend")} && npm run build
  cd ${path.dirname(ginaDir)}
  git add gina-backend/frontend/src/App.jsx gina-backend/frontend/dist
  git commit -m "Fix React #31: do not render empty job objects"
  git pull origin main --rebase && git push origin main
`);
