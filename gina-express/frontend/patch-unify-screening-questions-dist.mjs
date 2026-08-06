#!/usr/bin/env node
/**
 * Dist/bundle patcher: unify Board Screening with Jobs Tab setup.
 *
 * Changes in built assets/index-*.js:
 * 1) Board "Tailor questions" → "Screening questions for this role"
 * 2) Inject Maria Design Full Screening into Board tailor panel (qY)
 * 3) Board Apply writes job.questions + preserves answers (shared sync)
 * 4) Jobs Apply also remounts linked candidates' screening answers
 *
 * ONE LINE:
 *   node gina-express/frontend/patch-unify-screening-questions-dist.mjs ~/lyday-gina-backend/gina-backend
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const rootArg = String(process.argv[2] || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");
if (!rootArg) {
  console.error(
    "Usage: node patch-unify-screening-questions-dist.mjs ~/lyday-gina-backend/gina-backend",
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

function listBundles() {
  const out = [];
  if (fs.existsSync(appPath)) out.push(appPath);
  if (!fs.existsSync(distDir)) return out;
  for (const name of fs.readdirSync(distDir)) {
    if (/^index-.*\.js$/.test(name) || /^index\.js$/.test(name)) {
      out.push(path.join(distDir, name));
    }
  }
  return out;
}

/**
 * Rewrite Board apply (tC) to sync Jobs + preserve answers.
 * Minified shape:
 *   function tC(s,f){oe(s,{screening:f.map(y=>({question:y,answer:"",score:0})),usesCustomQuestions:!0})}
 */
function patchApplyFn(text) {
  const re =
    /function\s+(\w+)\((\w+),(\w+)\)\{(\w+)\(\2,\{screening:\3\.map\((\w+)=>\(\{question:\5,answer:"",score:0\}\)\),usesCustomQuestions:!0\}\)\}/;
  if (!re.test(text)) {
    // already patched or different shape
    if (/__ginaSharedScreeningApply/.test(text)) return { text, changed: false };
    return { text, changed: false, missing: true };
  }
  const next = text.replace(re, (_, fn, id, qs, oe, y) => {
    return `function ${fn}(${id},${qs}){` +
      `window.__ginaSharedScreeningApply=1;` +
      `const __cand=(typeof e!=="undefined"&&Array.isArray(e)?e:[]).find(c=>c&&c.id===${id});` +
      `const __jobId=__cand&&__cand.jobId;` +
      `const __prev=(__cand&&__cand.screening)||[];` +
      `const __merged=${qs}.map(q=>{` +
      `const t=String(q||"").trim();` +
      `const hit=__prev.find(s=>String(s.question||"").trim().toLowerCase()===t.toLowerCase());` +
      `return{question:t,answer:hit&&hit.answer||"",score:hit&&hit.score||0}` +
      `}).filter(q=>q.question);` +
      `${oe}(${id},{screening:__merged,usesCustomQuestions:!1});` +
      `if(__jobId&&typeof r==="function"){` +
      `r(jobs=> (Array.isArray(jobs)?jobs:[]).map(j=>j&&j.id===__jobId?{...j,questions:${qs}.map(String)}:j));` +
      `}` +
      `}`;
  });
  return { text: next, changed: next !== text };
}

/**
 * When Jobs editor applies questions onto form, also sync linked candidates.
 * Maria apply: function k(){x&&a(_=>({..._,questions:(x.questions||[]).map(E=>E.text)}))}
 * Generate apply similar with Use these questions.
 */
function patchJobsApplySync(text) {
  let out = text;
  let n = 0;

  // Maria "Use these questions" in job editor — after setting questions, sync candidates
  // Pattern: questions:(x.questions||[]).map(E=>E.text)
  const mariaApply =
    /questions:(\((\w+)\.questions\|\|\[\]\))\.map\((\w+)=>\w+\.text\)/g;
  // Don't rewrite the assignment itself; wrap nearby function k(){x&&a(...)}
  const mariaFn =
    /function\s+(\w+)\(\)\{(\w+)&&(\w+)\((\w+)=>\(\{\.\.\.\4,questions:\(\2\.questions\|\|\[\]\)\.map\((\w+)=>\5\.text\)\}\)\)\}/;
  if (mariaFn.test(out)) {
    out = out.replace(
      mariaFn,
      (_, fn, resultVar, setForm, formArg, qVar) => {
        n += 1;
        return (
          `function ${fn}(){` +
          `if(!${resultVar})return;` +
          `const __qs=(${resultVar}.questions||[]).map(${qVar}=>${qVar}.text).filter(Boolean);` +
          `${setForm}(${formArg}=>({...${formArg},questions:__qs}));` +
          `if(typeof t==="function"&&${formArg}&&${formArg}.id){` +
          `/* sync linked board candidates */` +
          `}` +
          `if(typeof t==="function"){` +
          `t(cands=>(Array.isArray(cands)?cands:[]).map(c=>{` +
          `const jobId=(typeof o!=="undefined"&&o&&o.id)||(${formArg}&&${formArg}.id);` +
          `if(!c||!jobId||c.jobId!==jobId)return c;` +
          `const prev=c.screening||[];` +
          `return{...c,usesCustomQuestions:!1,screening:__qs.map(q=>{` +
          `const hit=prev.find(s=>String(s.question||"").toLowerCase()===String(q).toLowerCase());` +
          `return{question:q,answer:hit&&hit.answer||"",score:hit&&hit.score||0}` +
          `})};` +
          `}));` +
          `}` +
          `}`
        );
      },
    );
  }

  // Also handle generate apply in Jobs: function v(){... questions from draft}
  // Pattern often: a(E=>({...E,questions:c.filter(...).map(...)}))
  const genApply =
    /function\s+(\w+)\(\)\{[^}]*questions:(\w+)\.filter\((\w+)=>\3\.include\)\.map\((\w+)=>\4\.text\)[^}]*\}/;
  if (genApply.test(out) && !/__ginaJobsGenApplySync/.test(out)) {
    out = out.replace(genApply, (full, fn, draftVar) => {
      n += 1;
      // Keep original but append candidate sync using form id `o`
      return (
        full.slice(0, -1) +
        `;window.__ginaJobsGenApplySync=1;` +
        `try{const __qs=${draftVar}.filter(z=>z.include).map(z=>z.text).filter(Boolean);` +
        `if(typeof t==="function"&&typeof o!=="undefined"&&o&&o.id){` +
        `t(cands=>(Array.isArray(cands)?cands:[]).map(c=>{` +
        `if(!c||c.jobId!==o.id)return c;` +
        `const prev=c.screening||[];` +
        `return{...c,usesCustomQuestions:!1,screening:__qs.map(q=>{` +
        `const hit=prev.find(s=>String(s.question||"").toLowerCase()===String(q).toLowerCase());` +
        `return{question:q,answer:hit&&hit.answer||"",score:hit&&hit.score||0}` +
        `})};` +
        `}));}` +
        `}catch(_e){}` +
        `}`
      );
    });
  }

  return { text: out, changed: n > 0, count: n };
}

/**
 * Expand Board qY tailor panel with Maria Design block (clone Jobs UI).
 */
function patchBoardMariaPanel(text) {
  if (/data-board-maria-screening=["']1["']/.test(text)) {
    return { text, changed: false, already: true };
  }
  if (!/Tailor questions to this role|Screening questions for this role/.test(text)) {
    return { text, changed: false, missing: true };
  }

  let out = text.replace(
    /Tailor questions to this role/g,
    "Screening questions for this role",
  );

  // Find function qY({candidate:e,onUpdateJD:t,onApply:n,onReset:r}){...}
  const sigRe =
    /function\s+(\w+)\(\{candidate:(\w+),onUpdateJD:(\w+),onApply:(\w+),onReset:(\w+)\}\)/;
  const sigMatch = out.match(sigRe);
  if (!sigMatch) {
    return { text: out, changed: out !== text, partial: "renamed only — qY not found" };
  }
  const start = sigMatch.index;
  const [, fn, e, t, n, r] = sigMatch;
  // Body opens at the '{' AFTER the parameter list — not the '{candidate:' brace.
  const afterSig = start + sigMatch[0].length;
  const i = out.indexOf("{", afterSig - 1);
  // Prefer the brace immediately following the signature
  const bodyOpen =
    out[afterSig] === "{"
      ? afterSig
      : out.indexOf("{", afterSig);
  if (bodyOpen < 0) {
    return { text: out, changed: out !== text, partial: "body open not found" };
  }

  let depth = 0;
  let end = -1;
  for (let p = bodyOpen; p < out.length; p++) {
    const ch = out[p];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = p + 1;
        break;
      }
    }
  }
  if (end < 0) {
    return { text: out, changed: out !== text, partial: "brace match failed" };
  }

  // Build enhanced Board panel with Maria Design (Jobs-tab parity).
  // Use string concat so nested ${} in output are literal.
  const cand = e;
  const upd = t;
  const apply = n;
  const reset = r;
  const enhanced = [
    `function ${fn}({candidate:${cand},onUpdateJD:${upd},onApply:${apply},onReset:${reset}}){`,
    `const[i,o]=M.useState(!0),[a,l]=M.useState("idle"),[u,c]=M.useState(null),[w,j]=M.useState("idle"),[x,b]=M.useState(null),[m,S]=M.useState("");`,
    `async function h(){l("working");try{const g=await YO(${cand}.role||${cand}.jobTitle,${cand}.jobDescription);c(g.map(v=>({text:v,include:!0}))),l("idle")}catch{l("error")}}`,
    `function p(){const g=u.filter(v=>v.include).map(v=>v.text);g.length!==0&&(${apply}(g),c(null))}`,
    `async function O(){j("working"),S("");try{const{baseUrl:_,relaySecret:E}=await ir();if(!_)throw new Error("Set Maria's backend URL in the Maria tab first.");`,
    `const $=await fetch(_.replace(/\\/$/,"")+"/maria/screening-setup",{method:"POST",headers:jt(E),body:JSON.stringify({roleTitle:${cand}.role||${cand}.jobTitle||"",roleDescription:${cand}.jobDescription||""})}),C=await $.json();`,
    `if(!$.ok)throw new Error(C.error||("HTTP "+$.status));b(C),j("idle")}catch(_){S(_.message),j("error")}}`,
    `function k(){x&&${apply}((x.questions||[]).map(E=>E.text).filter(Boolean)),b(null)}`,
    `return d.jsxs("div",{"data-board-maria-screening":"1",style:{border:"1px solid #E3DFD5",borderRadius:8,background:"#FBFAF7"},children:[`,
    `d.jsxs("button",{onClick:()=>o(g=>!g),style:{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 12px",border:"none",background:"none",cursor:"pointer",fontSize:13,fontWeight:600},children:[`,
    `d.jsx("span",{children:"Screening questions for this role"}),`,
    `d.jsx("span",{style:{fontSize:11,color:"#918D80",fontWeight:500},children:${cand}.usesCustomQuestions?"Custom override":"Synced with Jobs"})]}),`,
    `i&&d.jsxs("div",{style:{padding:"0 12px 14px",display:"flex",flexDirection:"column",gap:10},children:[`,
    `d.jsx("div",{style:{fontSize:11.5,color:"#918D80"},children:"Same setup as Jobs → Edit. Questions sync both ways; answers on this candidate are kept when the template updates."}),`,
    `d.jsxs("div",{children:[d.jsx("label",{style:Ve,children:"Job description (improves Generate + Maria)"}),`,
    `d.jsx("textarea",{value:${cand}.jobDescription,onChange:g=>${upd}(g.target.value),placeholder:"Paste the job description here",style:{...ke,height:90,resize:"vertical",fontSize:12.5}})]}),`,
    `d.jsxs("div",{style:{display:"flex",gap:8,alignItems:"center"},children:[`,
    `d.jsxs("button",{onClick:h,disabled:a==="working",style:{...Ee,fontWeight:600,display:"flex",alignItems:"center",gap:6},children:[d.jsx(Ha,{size:13})," ",a==="working"?"Generating…":"Generate questions"]}),`,
    `${cand}.usesCustomQuestions&&d.jsx("button",{onClick:${reset},style:{...Ee,color:"#918D80"},children:"Reset to Jobs / standard"})]}),`,
    `a==="error"&&d.jsx("div",{style:{fontSize:12,color:"#A34A42"},children:"Couldn't generate questions — try again."}),`,
    `u&&d.jsxs("div",{style:{border:"1px solid #E3DFD5",borderRadius:8,padding:10,background:"#fff",display:"flex",flexDirection:"column",gap:8},children:[`,
    `d.jsx("div",{style:{fontSize:12,color:"#918D80"},children:"Review, uncheck any you don't want, then apply (updates Jobs + Board):"}),`,
    `u.map((g,v)=>d.jsxs("label",{style:{display:"flex",gap:8,alignItems:"flex-start",fontSize:13},children:[`,
    `d.jsx("input",{type:"checkbox",checked:g.include,onChange:ev=>{const j=[...u];j[v]={...j[v],include:ev.target.checked},c(j)},style:{marginTop:3}}),`,
    `d.jsx("span",{children:g.text})]},v)),`,
    `d.jsxs("div",{style:{display:"flex",gap:8,marginTop:4},children:[`,
    `d.jsx("button",{onClick:p,style:ct,children:"Use these questions"}),`,
    `d.jsx("button",{onClick:()=>c(null),style:Ee,children:"Discard"})]})]}),`,
    `d.jsxs("div",{style:{border:"1px solid #E3DFD5",borderRadius:8,padding:12,background:"#FBFAF7"},children:[`,
    `d.jsxs("div",{style:{fontWeight:600,fontSize:13,marginBottom:8,display:"flex",alignItems:"center",gap:6},children:[d.jsx(ho,{size:14})," Have Maria design full screening"]}),`,
    `d.jsx("div",{style:{fontSize:11.5,color:"#918D80",marginBottom:8},children:"Richer than the quick generator above — extracts must-haves/deal-breakers/confidentiality level, tailors questions to those specifics, and flags legally sensitive ones (heuristic aid, not legal certification)."}),`,
    `d.jsxs("button",{onClick:O,disabled:w==="working",style:{...Ee,fontWeight:600,display:"flex",alignItems:"center",gap:6},children:[d.jsx(ho,{size:13})," ",w==="working"?"Working…":"Run Maria's screening setup"]}),`,
    `w==="error"&&d.jsx("div",{style:{fontSize:12,color:"#A34A42",marginTop:6},children:m}),`,
    `x&&d.jsxs("div",{style:{border:"1px solid #E3DFD5",borderRadius:8,padding:10,background:"#fff",marginTop:10,display:"flex",flexDirection:"column",gap:8},children:[`,
    `d.jsxs("div",{style:{fontSize:12},children:[d.jsx("strong",{children:"Confidentiality:"})," ",x.criteria.confidentialityLevel," — ",x.criteria.confidentialityReason]}),`,
    `d.jsxs("div",{style:{fontSize:12},children:[d.jsx("strong",{children:"Must-haves:"})," ",(x.criteria.mustHaves||[]).join("; ")]}),`,
    `d.jsxs("div",{style:{fontSize:12},children:[d.jsx("strong",{children:"Deal-breakers:"})," ",(x.criteria.dealBreakers||[]).join("; ")]}),`,
    `d.jsx("div",{style:{borderTop:"1px solid #E3DFD5",paddingTop:8},children:(x.questions||[]).map((_,E)=>d.jsxs("div",{style:{fontSize:12.5,marginBottom:6,display:"flex",gap:6},children:[d.jsxs("span",{children:[E+1,"."]}),d.jsxs("span",{children:[_.text,_.flagged&&d.jsxs("span",{style:{color:"#A34A42",fontWeight:600,marginLeft:6},children:["⚠ flagged — ",_.reason]})]})]},E))}),`,
    `d.jsx("button",{onClick:k,style:ct,children:"Use these questions"}),`,
    `d.jsx("div",{style:{fontSize:10.5,color:"#918D80"},children:x.disclaimer})]})]})]})]})} `,
  ].join("");

  out = out.slice(0, start) + enhanced + out.slice(end);
  return { text: out, changed: true };
}

/**
 * Jobs footer copy — clarify bidirectional sync.
 */
function patchJobsCopy(text) {
  const from =
    "New candidates linked to this job start with these questions automatically.";
  const to =
    "Shared with Board Screening — answers entered on either side stay with each candidate; template updates sync both ways.";
  if (!text.includes(from)) return { text, changed: false };
  return { text: text.replaceAll(from, to), changed: true };
}

function patchFile(filePath) {
  let text = fs.readFileSync(filePath, "utf8");
  const bak = `${filePath}.bak-unify-screening-${Date.now()}`;
  const results = [];

  let r = patchBoardMariaPanel(text);
  text = r.text;
  results.push(["board-maria", r]);

  r = patchApplyFn(text);
  text = r.text;
  results.push(["board-apply-sync", r]);

  r = patchJobsApplySync(text);
  text = r.text;
  results.push(["jobs-apply-sync", r]);

  r = patchJobsCopy(text);
  text = r.text;
  results.push(["jobs-copy", r]);

  const any = results.some(([, x]) => x.changed);
  if (!any) {
    console.log("No changes:", path.basename(filePath));
    return false;
  }
  fs.copyFileSync(filePath, bak);
  fs.writeFileSync(filePath, text, "utf8");
  console.log("Patched", path.basename(filePath));
  for (const [name, x] of results) {
    if (x.changed) console.log("  ✓", name);
    else if (x.missing) console.log("  ·", name, "(pattern not found)");
    else if (x.already) console.log("  ·", name, "(already)");
    else if (x.partial) console.log("  ·", name, `(${x.partial})`);
  }
  console.log("  backup:", bak);
  return true;
}

const files = listBundles();
if (!files.length) {
  console.error("No App.jsx or dist bundles found under", ginaDir);
  process.exit(2);
}

let n = 0;
for (const f of files) {
  if (patchFile(f)) n += 1;
}

if (n === 0) {
  console.error("FAILED: no screening unify patches applied");
  process.exit(2);
}

console.log(`
OK: unified screening in ${n} file(s).

Next:
  cd ${ginaDir}/frontend && npm run build
  # re-run THIS dist patcher AFTER build (Vite renames index-*.js)
  node ${path.join(path.dirname(fileURLToPath(import.meta.url)), "patch-unify-screening-questions-dist.mjs")} ${ginaDir}
  cd ${path.dirname(ginaDir)} && git add -f gina-backend/frontend/dist gina-backend/frontend/src/App.jsx
  git commit -m "Unify Board + Jobs screening questions (Generate + Maria, sync answers)"
  git push origin main
`);
