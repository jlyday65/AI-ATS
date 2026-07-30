#!/usr/bin/env node
/**
 * Nuclear restore of gina.js when prompt prose / backtick damage makes
 * strip repairs fail (e.g. Unexpected identifier 'task' then 'Proposed').
 *
 * Picks the newest parseable gina.js.bak* or git revision, then injects
 * safe const GINA_TEAM_RULES (no raw paste).
 *
 * ONE LINE:
 *   node gina-express/frontend/nuclear-restore-gina-js.mjs ~/lyday-gina-backend/gina-backend
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.join(__dirname, "..");

const raw = String(process.argv[2] || "")
  .trim()
  .replace(/^~(?=$|\/|\\)/, process.env.HOME || "");
let root = path.resolve(raw);

function findGinaJs(start) {
  const candidates = [
    start,
    path.join(start, "gina.js"),
    path.join(start, "gina-backend", "gina.js"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile() && /gina\.js$/i.test(c)) {
      return c;
    }
  }
  if (fs.existsSync(start) && fs.statSync(start).isDirectory()) {
    const walk = (dir, depth) => {
      if (depth < 0) return null;
      let names;
      try {
        names = fs.readdirSync(dir);
      } catch {
        return null;
      }
      if (names.includes("gina.js")) {
        const p = path.join(dir, "gina.js");
        if (fs.statSync(p).isFile()) return p;
      }
      for (const n of names) {
        if (["node_modules", ".git", "dist", "frontend"].includes(n)) continue;
        const hit = walk(path.join(dir, n), depth - 1);
        if (hit) return hit;
      }
      return null;
    };
    return walk(start, 3);
  }
  return null;
}

const target = findGinaJs(root);
if (!target) {
  console.error(
    "Usage (one line): node nuclear-restore-gina-js.mjs ~/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

const ginaDir = path.dirname(target);
console.log("Target:", target);

function canParse(code) {
  const tmp = `${target}.parse-tmp-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`;
  fs.writeFileSync(tmp, code, "utf8");
  const r = spawnSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
  try {
    fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }
  return {
    ok: r.status === 0,
    err: (r.stderr || r.stdout || "").trim().split("\n").slice(0, 4).join(" | "),
  };
}

function score(text) {
  let s = 0;
  if (canParse(text).ok) s += 100;
  else return -1;
  if (/command_agent/.test(text)) s += 20;
  if (/source_candidates_signalhire/.test(text)) s += 10;
  if (/create_candidate_file|candidate-file\.tool/.test(text)) s += 8;
  if (/You are Gina/i.test(text)) s += 5;
  if (/get_pipeline_summary/.test(text)) s += 5;
  if (/GINA TEAM COMMAND RULE|GINA_TEAM_RULES/.test(text)) s += 3;
  // Prefer not having obvious orphan prose
  if (/^\s*POST \/ats\/candidate-files/m.test(text)) s -= 50;
  if (/^\s*CANDIDATE FILE \(required/m.test(text)) s -= 50;
  if (/^\s*TEAM BOT UPDATE RULE/m.test(text)) s -= 50;
  s += Math.min(20, Math.floor(text.length / 5000));
  return s;
}

function injectSafeRules(code) {
  let kitRule = "";
  const kitPath = path.join(pkg, "GINA_TEAM_PROMPT_RULE.txt");
  if (fs.existsSync(kitPath)) {
    kitRule = fs.readFileSync(kitPath, "utf8").trim().replace(/`/g, "'");
  }
  const force = [
    "CRITICAL TOOL RULE: Queue Maria/Michelle/Kelley/Ashton via command_agent (or source_candidates_signalhire for Maria).",
    "TEAM BOT UPDATE RULE: Bot replies dual-file to Kimberley's Notes and Gina pipeline Team updates.",
    "PIPELINE BRIEFING: Always pull /ats/kimberley-notes/briefing or /ats/pipeline-briefing for Team updates.",
    kitRule,
  ]
    .filter(Boolean)
    .join("\n\n")
    .replace(/`/g, "'");
  const rulesConst = `const GINA_TEAM_RULES = \`${force}\`;`;

  let next = code;
  // Remove any orphan raw prompt blocks that somehow remain at top level
  next = next.replace(
    /\n(?:GINA TEAM COMMAND RULE|TEAM BOT UPDATE RULE|CANDIDATE FILE \(required|PIPELINE BRIEFING|CRITICAL TOOL RULE|DUAL-FILE RULE|SOURCE_CANDIDATES RULE)[\s\S]*?(?=\n(?:import |export |const |let |var |function |async function |class |module\.exports|app\.|router\.))/g,
    "\n",
  );

  if (/const GINA_TEAM_RULES\s*=/.test(next)) {
    next = next.replace(/const GINA_TEAM_RULES\s*=\s*`[\s\S]*?`;/, rulesConst);
  } else if (/^import .+$/m.test(next)) {
    const lastImport = [...next.matchAll(/^import .+$/gm)].pop();
    const idx = lastImport.index + lastImport[0].length;
    next = next.slice(0, idx) + "\n\n" + rulesConst + "\n" + next.slice(idx);
  } else {
    next = rulesConst + "\n\n" + next;
  }

  // Strip self-refs inside const
  next = next.replace(
    /const GINA_TEAM_RULES\s*=\s*`([\s\S]*?)`;/,
    (_m, body) =>
      `const GINA_TEAM_RULES = \`${String(body).replace(/\$\{GINA_TEAM_RULES\}/g, "")}\`;`,
  );

  if (!/\$\{GINA_TEAM_RULES\}/.test(next)) {
    if (/systemPrompt\s*=\s*`/.test(next)) {
      next = next.replace(/systemPrompt\s*=\s*`/, "systemPrompt = `${GINA_TEAM_RULES}\n\n` + `");
    } else if (/const\s+SYSTEM\s*=\s*`/.test(next)) {
      next = next.replace(/const\s+SYSTEM\s*=\s*`/, "const SYSTEM = `${GINA_TEAM_RULES}\n\n");
    }
  }

  next = next.replace(
    /enum\s*:\s*\[\s*["']create_candidate["']\s*,\s*["']update_stage["']\s*,\s*["']add_note["']\s*\]/g,
    'enum: ["create_candidate", "update_stage", "add_note", "command_agent", "source_candidates_signalhire", "import_candidate", "create_candidate_file"]',
  );

  return next;
}

const candidates = [];

// Live file
{
  const text = fs.readFileSync(target, "utf8");
  candidates.push({
    label: "live gina.js",
    text,
    score: score(text),
  });
}

// Local backups
for (const name of fs.readdirSync(ginaDir)) {
  if (!name.startsWith("gina.js.bak") && name !== "gina.js.bak") continue;
  if (name.includes(".parse-tmp-")) continue;
  const p = path.join(ginaDir, name);
  try {
    const text = fs.readFileSync(p, "utf8");
    candidates.push({ label: `bak:${name}`, text, score: score(text), path: p });
  } catch {
    /* ignore */
  }
}

// Git history (ginaDir or parent repo root)
function gitShow(cwd, revPath) {
  const r = spawnSync("git", ["show", revPath], {
    cwd,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.status !== 0) return null;
  return r.stdout;
}

const gitRoots = [ginaDir, path.dirname(ginaDir)];
for (const cwd of gitRoots) {
  if (!fs.existsSync(path.join(cwd, ".git"))) continue;
  const log = spawnSync(
    "git",
    ["log", "--oneline", "-20", "--", "gina.js", "gina-backend/gina.js"],
    { cwd, encoding: "utf8" },
  );
  if (log.status !== 0) continue;
  const shas = (log.stdout || "")
    .split("\n")
    .map((l) => l.split(/\s+/)[0])
    .filter(Boolean)
    .slice(0, 12);
  for (const sha of shas) {
    for (const rel of ["gina.js", "gina-backend/gina.js"]) {
      const text = gitShow(cwd, `${sha}:${rel}`);
      if (!text) continue;
      candidates.push({
        label: `git:${sha}:${rel}`,
        text,
        score: score(text),
      });
    }
  }
}

candidates.sort((a, b) => b.score - a.score);
console.log("\nTop candidates (parseable first):");
for (const c of candidates.slice(0, 12)) {
  console.log(`  score=${c.score} ${c.label} (len=${c.text.length})`);
}

const best = candidates.find((c) => c.score >= 100);
if (!best) {
  console.error("\nNo parseable gina.js backup/git revision found.");
  console.error("Look under", ginaDir, "for gina.js.bak-* and restore manually.");
  process.exit(2);
}

console.log("\nChosen:", best.label, "score=", best.score);

let restored = best.text;
// Only inject rules if inject still parses
const withRules = injectSafeRules(restored);
if (canParse(withRules).ok) {
  restored = withRules;
  console.log("Injected safe GINA_TEAM_RULES");
} else {
  console.warn("Safe rules inject would break parse — restoring clean backup as-is");
  const check = canParse(restored);
  if (!check.ok) {
    console.error("Chosen candidate somehow does not parse:", check.err);
    process.exit(2);
  }
}

const safety = `${target}.bak-nuclear-${Date.now()}`;
fs.copyFileSync(target, safety);
fs.writeFileSync(target, restored, "utf8");

const verify = canParse(fs.readFileSync(target, "utf8"));
if (!verify.ok) {
  console.error("REFUSING: wrote non-parseable file — restoring previous");
  fs.copyFileSync(safety, target);
  process.exit(2);
}

console.log("OK: restored parseable gina.js");
console.log("From:", best.label);
console.log("Safety bak of previous broken file:", safety);
console.log("command_agent:", /command_agent/.test(restored));
console.log("GINA_TEAM_RULES:", /const GINA_TEAM_RULES/.test(restored));
console.log(`
Next:
  node --check ${target}
  cd ~/lyday-gina-backend
  git add gina-backend/gina.js
  git status
  git commit -m "Nuclear restore parseable gina.js"
  git pull origin main --rebase
  git push origin main
`);
