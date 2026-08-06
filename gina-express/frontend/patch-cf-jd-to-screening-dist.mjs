#!/usr/bin/env node
/**
 * Ensure Candidate File / Jobs JD appears in Board Screening's Job description
 * field. Seeds candidate.jobDescription from the linked Jobs row when empty.
 *
 * ONE LINE:
 *   node gina-express/frontend/patch-cf-jd-to-screening-dist.mjs ~/lyday-gina-backend/gina-backend
 */
import fs from "fs";
import path from "path";

const rootArg = String(process.argv[2] || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");
if (!rootArg) {
  console.error(
    "Usage: node patch-cf-jd-to-screening-dist.mjs ~/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

const root = path.resolve(rootArg);
const ginaDir = fs.existsSync(path.join(root, "frontend", "dist"))
  ? root
  : fs.existsSync(path.join(root, "gina-backend", "frontend", "dist"))
    ? path.join(root, "gina-backend")
    : root;

const distDir = path.join(ginaDir, "frontend", "dist", "assets");
const appPath = path.join(ginaDir, "frontend", "src", "App.jsx");

function listTargets() {
  const out = [];
  if (fs.existsSync(appPath)) out.push(appPath);
  if (fs.existsSync(distDir)) {
    for (const name of fs.readdirSync(distDir)) {
      if (/^index-.*\.js$/.test(name)) out.push(path.join(distDir, name));
    }
  }
  return out;
}

function patchText(text) {
  let out = text;
  let n = 0;

  // 1) Board Screening textarea: fall back to linked Jobs.description
  // Minified: value:e.jobDescription
  // Also: value:N.jobDescription (if inlined)
  const valueRe = /value:([A-Za-z_$][\w$]*)\.jobDescription(?![?\w])/g;
  out = out.replace(valueRe, (m, obj) => {
    // Avoid double-patch
    if (m.includes("__ginaJdFromJob")) return m;
    n += 1;
    return (
      `value:${obj}.jobDescription||((()=>{try{` +
      `const __jobs=typeof n!=="undefined"&&Array.isArray(n)?n:` +
      `(typeof jobs!=="undefined"&&Array.isArray(jobs)?jobs:[]);` +
      `const __j=__jobs.find(x=>x&&(${obj}.jobId?x.id===${obj}.jobId:` +
      `String(x.title||x.name||"").toLowerCase()===String(${obj}.role||${obj}.jobTitle||"").toLowerCase()));` +
      `return __j&&(__j.description||__j.jobDescription)||""` +
      `}catch{return""}})())`
    );
  });

  // 2) When mounting Board screening panel (qY), seed empty jobDescription from Jobs
  // Pattern: qY,{candidate:N,onUpdateJD:
  const mountRe =
    /(\w+)\(\{candidate:([A-Za-z_$][\w$]*),onUpdateJD:([A-Za-z_$][\w$]*)=>((\w+)\(\2\.id,\{jobDescription:\w+\}\))/;
  if (mountRe.test(out) && !/__ginaSeedBoardJd/.test(out)) {
    out = out.replace(
      /(\w+)\.jsx\((\w+),\{candidate:([A-Za-z_$][\w$]*),onUpdateJD:/g,
      (full, jsx, comp, cand) => {
        // Only seed near Screening / qY / BoardScreening
        n += 1;
        return (
          `((()=>{try{window.__ginaSeedBoardJd=1;` +
          `const __c=${cand};` +
          `if(__c&&!String(__c.jobDescription||"").trim()){` +
          `const __jobs=typeof n!=="undefined"&&Array.isArray(n)?n:[];` +
          `const __j=__jobs.find(x=>x&&(__c.jobId?x.id===__c.jobId:String(x.title||"").toLowerCase()===String(__c.role||__c.jobTitle||"").toLowerCase()));` +
          `const __jd=__j&&(__j.description||__j.jobDescription)||"";` +
          `if(__jd&&typeof oe==="function")oe(__c.id,{jobDescription:__jd})` +
          `}}catch(_){}return null})(),${jsx}.jsx(${comp},{candidate:${cand},onUpdateJD:`
        );
      },
    );
  }

  // Source App.jsx friendlier: candidate={N} near jobDescription onUpdate
  if (
    /jobDescription/.test(out) &&
    /Tailor questions|Screening questions for this role|BoardScreeningSetup|onUpdateJD/.test(
      out,
    ) &&
    !/__ginaSeedBoardJd/.test(out)
  ) {
    // Soft: ensure Jobs description field also accepts jobDescription alias when saving
    if (
      /description:\s*form\.description/.test(out) &&
      !/jobDescription:\s*form\.description/.test(out)
    ) {
      out = out.replace(
        /description:\s*form\.description/g,
        "description: form.description, jobDescription: form.description",
      );
      n += 1;
    }
  }

  return { text: out, changed: n > 0, count: n };
}

let patched = 0;
for (const file of listTargets()) {
  const raw = fs.readFileSync(file, "utf8");
  const { text, changed, count } = patchText(raw);
  if (!changed) {
    console.log("No change:", path.basename(file));
    continue;
  }
  const bak = `${file}.bak-cf-jd-${Date.now()}`;
  fs.copyFileSync(file, bak);
  fs.writeFileSync(file, text, "utf8");
  console.log("Patched", path.basename(file), `(${count} edits)`);
  console.log("Backup:", bak);
  patched += 1;
}

if (!patched) {
  console.error("FAILED: no Board Screening JD fallback applied");
  process.exit(2);
}
console.log("OK: Candidate File JD → Board Screening / Jobs fields");
