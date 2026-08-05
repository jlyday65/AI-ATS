#!/usr/bin/env node
/**
 * Fix: Jobs Tab Edit crashes —
 *   TypeError: undefined is not an object (evaluating 'o.questions.length')
 *
 * The Jobs editor does useState(job) and then reads form.questions.length.
 * Maria-upserted jobs omit questions. Patch BOTH App.jsx source patterns
 * (form/draft/job/etc.) AND the built dist bundle so Railway cannot ship
 * the unsafe access again.
 *
 * ONE LINE:
 *   node gina-express/frontend/patch-jobs-edit-questions.mjs ~/lyday-gina-backend/gina-backend
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
    "Usage: node patch-jobs-edit-questions.mjs ~/lyday-gina-backend/gina-backend",
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

/** Make every foo.questions.length / .map safe, without double-wrapping. */
function hardenQuestionsAccess(text) {
  let out = text;
  let n = 0;
  // Already safe: (x.questions || []).length  / (x.questions||[]).length
  // Unsafe: x.questions.length  (but not when already wrapped)
  out = out.replace(
    /(?<!\|\| \[\]\)\.)(?<!\|\|\[\]\)\.)(?<!\(\s*)\b([A-Za-z_$][\w$]*)\.questions\.length\b/g,
    (m, id) => {
      n += 1;
      return `(${id}.questions || []).length`;
    },
  );
  out = out.replace(
    /(?<!\|\| \[\]\)\.)(?<!\|\|\[\]\)\.)(?<!\(\s*)\b([A-Za-z_$][\w$]*)\.questions\.map\b/g,
    (m, id) => {
      n += 1;
      return `(${id}.questions || []).map`;
    },
  );
  // h&&h.questions.length → h&&h.questions&&h.questions.length (then first pass wraps)
  out = out.replace(
    /\b([A-Za-z_$][\w$]*)&&\1\.questions\.length\b/g,
    (m, id) => {
      n += 1;
      return `${id}&&${id}.questions&&(${id}.questions || []).length`;
    },
  );
  // Collapse accidental double wraps
  out = out.replace(
    /\(\(([A-Za-z_$][\w$]*)\.questions \|\| \[\]\)\.length\)/g,
    "($1.questions || []).length",
  );
  return { text: out, n };
}

function ensureNormalizeHelper(src) {
  if (src.includes("function __ginaNormalizeJobForEdit")) return { src, added: false };
  const helper = `
function __ginaNormalizeJobForEdit(job = {}) {
  const base = job && typeof job === "object" ? job : {};
  const q = Array.isArray(base.questions) ? base.questions : [];
  const hc = Number(base.headcount);
  return {
    ...base,
    questions: q,
    headcount: Number.isFinite(hc) && hc > 0 ? hc : 1,
    description: base.description || base.jobDescription || "",
    jobDescription: base.jobDescription || base.description || "",
    title: base.title || base.name || "",
    status: base.status || "open",
  };
}
`;
  const appAt = src.search(
    /export\s+default\s+function\s+App\b|function\s+(?:App|CandidateTracker)\b/,
  );
  if (appAt < 0) {
    return { src: helper + "\n" + src, added: true };
  }
  return { src: src.slice(0, appAt) + helper + "\n" + src.slice(appAt), added: true };
}

function normalizeEditorUseState(src) {
  const marker = src.indexOf("Screening questions for this role");
  if (marker < 0) return { src, changed: false };
  const windowStart = Math.max(0, marker - 4000);
  const slice = src.slice(windowStart, marker + 200);
  // Match: const [form, setForm] = useState(job)  OR useState(e) OR useState(initialJob)
  const re =
    /const\s*\[\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\]\s*=\s*useState\(\s*([A-Za-z_$][\w$]*)\s*\)/;
  const m = slice.match(re);
  if (!m) return { src, changed: false };
  if (m[0].includes("__ginaNormalizeJobForEdit")) return { src, changed: false };
  const at = windowStart + slice.indexOf(m[0]);
  const stateVar = m[1];
  const setter = m[2];
  const initVar = m[3];
  const replacement = `const [${stateVar}, ${setter}] = useState(() => __ginaNormalizeJobForEdit(${initVar}))`;
  return {
    src: src.slice(0, at) + replacement + src.slice(at + m[0].length),
    changed: true,
  };
}

function patchDistBundles(frontendDir) {
  const assetsDir = path.join(frontendDir, "dist", "assets");
  if (!fs.existsSync(assetsDir)) {
    console.warn("No dist/assets yet — build first, then re-run or rely on APPLY script order");
    return 0;
  }
  let files = 0;
  for (const name of fs.readdirSync(assetsDir)) {
    if (!/^index-.*\.js$/.test(name)) continue;
    const fp = path.join(assetsDir, name);
    let js = fs.readFileSync(fp, "utf8");
    if (!js.includes("Screening questions for this role") && !js.includes(".questions.length")) {
      continue;
    }
    const before = js;
    // Nuclear dist harden
    js = js.replace(
      /(?<!\|\|\[\]\)\.)(?<!\|\| \[\]\)\.)\b([A-Za-z_$][\w$]*)\.questions\.length\b/g,
      "($1.questions||[]).length",
    );
    js = js.replace(
      /(?<!\|\|\[\]\)\.)(?<!\|\| \[\]\)\.)\b([A-Za-z_$][\w$]*)\.questions\.map\b/g,
      "($1.questions||[]).map",
    );
    // Normalize Job editor useState(e) in minified form: useState(e) near Screening questions
    const marker = js.indexOf("Screening questions for this role");
    if (marker > 0) {
      const windowStart = Math.max(0, marker - 2500);
      const slice = js.slice(windowStart, marker);
      const m = slice.match(
        /\[(\w+),(\w+)\]=(\w+)\.useState\((\w+)\)/,
      );
      if (m && !slice.includes("__ginaNormalizeJobForEdit")) {
        // Inline normalize at useState without helper (dist-safe):
        // useState(e) → useState({...e,questions:Array.isArray(e.questions)?e.questions:[],headcount:Number(e.headcount)>0?Number(e.headcount):1})
        const at = windowStart + slice.lastIndexOf(m[0]);
        const state = m[1];
        const setState = m[2];
        const react = m[3];
        const init = m[4];
        const repl = `[${state},${setState}]=${react}.useState({...${init},questions:Array.isArray(${init}.questions)?${init}.questions:[],headcount:Number(${init}.headcount)>0?Number(${init}.headcount):1,description:${init}.description||${init}.jobDescription||"",jobDescription:${init}.jobDescription||${init}.description||""})`;
        js = js.slice(0, at) + repl + js.slice(at + m[0].length);
      }
    }
    if (js !== before) {
      fs.writeFileSync(fp, js, "utf8");
      files += 1;
      console.log("Patched dist bundle:", name);
    } else {
      console.log("Dist bundle already safe or no match:", name);
    }
  }
  return files;
}

let src = fs.readFileSync(appPath, "utf8");
const bak = `${appPath}.bak-jobs-edit-q-${Date.now()}`;
fs.copyFileSync(appPath, bak);

const esbuild = loadEsbuild();
const before = canCompile(esbuild, src);
if (!before.ok) {
  console.error("App.jsx does not compile before patch:", before.error);
  process.exit(2);
}

let changed = 0;

const helper = ensureNormalizeHelper(src);
src = helper.src;
if (helper.added) {
  changed += 1;
  console.log("Inserted __ginaNormalizeJobForEdit helper");
}

const editor = normalizeEditorUseState(src);
src = editor.src;
if (editor.changed) {
  changed += 1;
  console.log("Normalized Jobs editor useState(job) → __ginaNormalizeJobForEdit");
}

const hardened = hardenQuestionsAccess(src);
src = hardened.text;
if (hardened.n) {
  changed += 1;
  console.log("Hardened questions length/map accesses:", hardened.n);
}

// Boot backfill: ensure every persisted job has questions:[]
if (!src.includes("__ginaJobsQuestionsBackfill")) {
  const jobsState = src.search(
    /const\s*\[\s*jobs\s*,\s*setJobs\s*\]\s*=\s*useState\s*\(/,
  );
  if (jobsState >= 0 && /useEffect/.test(src)) {
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
    try {
      setJobs((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        let dirty = false;
        const next = list.map((job) => {
          if (!job || typeof job !== "object") return job;
          const needsQ = !Array.isArray(job.questions);
          const needsHc = !(Number(job.headcount) > 0);
          if (!needsQ && !needsHc) return job;
          dirty = true;
          return {
            ...job,
            questions: Array.isArray(job.questions) ? job.questions : [],
            headcount: needsHc ? 1 : job.headcount,
          };
        });
        return dirty ? next : list;
      });
    } catch (e) { /* ignore */ }
    if (typeof window !== "undefined") window.__ginaJobsQuestionsBackfill = true;
  }, []);
`;
      src = src.slice(0, end) + inject + src.slice(end);
      changed += 1;
      console.log("Injected jobs questions/headcount backfill useEffect");
    }
  }
}

// Keep sanitizeGinaJob questions-safe if present
if (src.includes("function sanitizeGinaJob(") && !/questions,\s*\n\s*status:/.test(src) && !src.includes("questions,\n    status:")) {
  if (!src.includes("// Jobs Edit crashes on o.questions.length")) {
    // Light touch: ensure return includes questions: Array.isArray...
    src = src.replace(
      /preferredSkills:\s*asSkills\(job\.preferredSkills\),\s*\n(\s*)status:/,
      `preferredSkills: asSkills(job.preferredSkills),\n$1questions: Array.isArray(job.questions) ? job.questions : [],\n$1status:`,
    );
    if (src.includes("questions: Array.isArray(job.questions)")) {
      changed += 1;
      console.log("Injected questions into sanitizeGinaJob return");
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

// Refresh applyAgentAction (upsert always sets questions:[])
const check = spawnSync(
  process.execPath,
  [path.join(__dirname, "patch-check-for-actions.mjs"), ginaDir],
  { stdio: "inherit" },
);
if (check.status !== 0) {
  console.error("patch-check-for-actions failed:", check.status);
  process.exit(check.status || 2);
}

// If dist already exists, harden it now (APPLY script also rebuilds then re-hardens)
const distPatched = patchDistBundles(path.join(ginaDir, "frontend"));
console.log("Dist bundles patched:", distPatched);

console.log(`
Next:
  cd ${path.join(ginaDir, "frontend")} && npm run build
  node ${path.join(__dirname, "patch-jobs-edit-questions-dist.mjs")} ${ginaDir}
  git add -f frontend/dist frontend/src/App.jsx
  git commit -m "Fix Jobs Edit crash: safe questions access in source + dist"
  git push

Then hard-refresh Gina ATS (new index-*.js hash) and Edit the job again.
`);
