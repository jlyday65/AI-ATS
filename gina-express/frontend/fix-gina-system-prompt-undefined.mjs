#!/usr/bin/env node
/**
 * Fix Railway/chat HTTP 500: {"error":"SYSTEM_PROMPT is not defined"}
 *
 * Chat still references SYSTEM_PROMPT after restore/prompt strips removed
 * `const SYSTEM_PROMPT = \`...\``. Nuclear restore previously only wired
 * GINA_TEAM_RULES into systemPrompt / SYSTEM — not SYSTEM_PROMPT.
 *
 * ONE LINE:
 *   node gina-express/frontend/fix-gina-system-prompt-undefined.mjs ~/lyday-gina-backend/gina-backend --force
 *
 * Diagnose:
 *   node gina-express/frontend/fix-gina-system-prompt-undefined.mjs ~/lyday-gina-backend/gina-backend --diagnose
 */

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.join(__dirname, "..");

const args = process.argv.slice(2).filter(Boolean);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const diagnoseOnly = flags.has("--diagnose") || flags.has("-n");
const force = flags.has("--force");
const pos = args.filter((a) => !a.startsWith("--"));

const raw = String(pos[0] || "")
  .trim()
  .replace(/^~(?=$|\/|\\)/, process.env.HOME || "");
const root = path.resolve(raw);
const ginaDir = fs.existsSync(path.join(root, "gina.js"))
  ? root
  : fs.existsSync(path.join(root, "gina-backend", "gina.js"))
    ? path.join(root, "gina-backend")
    : root;

const ginaPath = path.join(ginaDir, "gina.js");
if (!raw || !fs.existsSync(ginaPath)) {
  console.error(
    "Usage (one line):\n" +
      "  node fix-gina-system-prompt-undefined.mjs ~/lyday-gina-backend/gina-backend --force",
  );
  process.exit(1);
}

function canParse(file, code) {
  const tmp = `${file}.parse-tmp-${Date.now()}.mjs`;
  fs.writeFileSync(tmp, code, "utf8");
  const r = spawnSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
  try {
    fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }
  return { ok: r.status === 0, err: (r.stderr || r.stdout || "").trim() };
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function usesSystemPrompt(src) {
  return /\bSYSTEM_PROMPT\b/.test(stripComments(src));
}

function hasSystemPromptBinding(src) {
  return (
    /\b(?:const|let|var)\s+SYSTEM_PROMPT\s*=/.test(src) ||
    /\bfunction\s+SYSTEM_PROMPT\s*\(/.test(src) ||
    /^import\s*\{[^}\n]*\bSYSTEM_PROMPT\b[^}\n]*\}/m.test(src)
  );
}

/** Extract `const SYSTEM_PROMPT = \`...\`;` or `= "..."` / `= '...'` / `= expr;` (one statement). */
function extractSystemPromptConst(src) {
  const m = src.match(/\b(?:const|let|var)\s+SYSTEM_PROMPT\s*=/);
  if (!m) return null;
  const start = m.index;
  let i = start + m[0].length;
  while (src[i] === " " || src[i] === "\n" || src[i] === "\r" || src[i] === "\t") {
    i += 1;
  }
  const quote = src[i];
  if (quote === "`" || quote === '"' || quote === "'") {
    i += 1;
    let body = quote;
    while (i < src.length) {
      const ch = src[i];
      if (ch === "\\") {
        body += ch + (src[i + 1] || "");
        i += 2;
        continue;
      }
      body += ch;
      i += 1;
      if (ch === quote) break;
    }
    while (src[i] === " " || src[i] === "\n" || src[i] === "\r") i += 1;
    if (src[i] === ";") i += 1;
    return src.slice(start, i).trim();
  }
  // Expression form through semicolon (best-effort, max 4k)
  const end = src.indexOf(";", i);
  if (end === -1 || end - start > 4000) return null;
  return src.slice(start, end + 1).trim();
}

function findRecoveredConst(ginaDir, ginaPath) {
  const names = fs.readdirSync(ginaDir).filter(
    (n) =>
      (n.startsWith("gina.js.bak") || n === "gina.js.bak") &&
      !n.includes(".parse-tmp-"),
  );
  // Newest mtime first
  names.sort((a, b) => {
    try {
      return (
        fs.statSync(path.join(ginaDir, b)).mtimeMs -
        fs.statSync(path.join(ginaDir, a)).mtimeMs
      );
    } catch {
      return 0;
    }
  });

  for (const name of names) {
    try {
      const text = fs.readFileSync(path.join(ginaDir, name), "utf8");
      const extracted = extractSystemPromptConst(text);
      if (!extracted) continue;
      // Prefer backups that still parse when we only take the const… skip full-file parse
      if (/You are Gina|Lyday|orchestrat|command_agent|Maria/i.test(extracted)) {
        return { label: name, constDecl: extracted };
      }
      return { label: name, constDecl: extracted };
    } catch {
      /* ignore */
    }
  }

  // git show HEAD:gina.js / gina-backend/gina.js
  for (const cwd of [ginaDir, path.dirname(ginaDir)]) {
    for (const rev of [
      "HEAD:gina.js",
      "HEAD:gina-backend/gina.js",
      "main:gina.js",
      "main:gina-backend/gina.js",
    ]) {
      const r = spawnSync("git", ["show", rev], {
        cwd,
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
      });
      if (r.status !== 0 || !r.stdout) continue;
      const extracted = extractSystemPromptConst(r.stdout);
      if (extracted) return { label: `git:${rev}`, constDecl: extracted };
    }
  }

  void ginaPath;
  return null;
}

function kitFallbackPrompt() {
  const kitPath = path.join(pkg, "GINA_TEAM_PROMPT_RULE.txt");
  let rules = "";
  if (fs.existsSync(kitPath)) {
    rules = fs.readFileSync(kitPath, "utf8").trim().replace(/`/g, "'");
  }
  const base = [
    "You are Gina, the ATS orchestrator for Lyday Talent Partners.",
    "Help Kimberley manage candidates, queue work for Maria/Michelle/Kelley/Ashton,",
    "and keep the pipeline moving. Prefer tools/queue actions over refusing.",
    "",
    rules,
  ]
    .filter(Boolean)
    .join("\n");
  // Escape backticks for template literal
  const safe = base.replace(/`/g, "'").replace(/\$\{/g, "\\${");
  return `const SYSTEM_PROMPT = \`${safe}\`;`;
}

function ensureGinaTeamRules(src) {
  if (/\b(?:const|let|var)\s+GINA_TEAM_RULES\s*=/.test(src)) return src;
  const kitPath = path.join(pkg, "GINA_TEAM_PROMPT_RULE.txt");
  let rules = "CRITICAL TOOL RULE: Queue Maria via command_agent or source_candidates_signalhire.";
  if (fs.existsSync(kitPath)) {
    rules = fs.readFileSync(kitPath, "utf8").trim().replace(/`/g, "'");
  }
  const decl = `const GINA_TEAM_RULES = \`${rules.replace(/\$\{/g, "\\${")}\`;`;
  if (/^import .+$/m.test(src)) {
    const last = [...src.matchAll(/^import .+$/gm)].pop();
    const idx = last.index + last[0].length;
    return src.slice(0, idx) + "\n\n" + decl + "\n" + src.slice(idx);
  }
  return decl + "\n\n" + src;
}

function injectBinding(src) {
  let next = src;
  const already = hasSystemPromptBinding(next);
  if (already && !force) {
    return { src, changed: false, reason: "SYSTEM_PROMPT already bound" };
  }

  // Drop broken binding when forcing
  if (force && already) {
    const extracted = extractSystemPromptConst(next);
    if (extracted) {
      next = next.replace(extracted, "");
    } else {
      next = next.replace(/\b(?:const|let|var)\s+SYSTEM_PROMPT\s*=\s*[^;]+;?\s*/m, "");
    }
  }

  // Prefer alias to existing prompt vars (must come AFTER the source const)
  if (/\b(?:const|let|var)\s+systemPrompt\s*=/.test(next)) {
    const alias = "const SYSTEM_PROMPT = systemPrompt;";
    return insertAfterNamedConst(
      next,
      "systemPrompt",
      alias,
      "aliased SYSTEM_PROMPT = systemPrompt",
    );
  }
  if (/\b(?:const|let|var)\s+SYSTEM\s*=/.test(next)) {
    const alias = "const SYSTEM_PROMPT = SYSTEM;";
    return insertAfterNamedConst(
      next,
      "SYSTEM",
      alias,
      "aliased SYSTEM_PROMPT = SYSTEM",
    );
  }

  // Recover from bak / git
  const recovered = findRecoveredConst(ginaDir, ginaPath);
  if (recovered?.constDecl) {
    // Ensure it doesn't TDZ-reference itself oddly
    let decl = recovered.constDecl;
    if (
      /GINA_TEAM_RULES/.test(decl) &&
      !/\b(?:const|let|var)\s+GINA_TEAM_RULES\s*=/.test(next)
    ) {
      next = ensureGinaTeamRules(next);
    }
    return insertAfterRulesOrImports(
      next,
      decl.endsWith(";") ? decl : decl + ";",
      `restored SYSTEM_PROMPT from ${recovered.label}`,
    );
  }

  // Build from GINA_TEAM_RULES
  next = ensureGinaTeamRules(next);
  if (/\b(?:const|let|var)\s+GINA_TEAM_RULES\s*=/.test(next)) {
    const decl = `const SYSTEM_PROMPT = \`You are Gina, the ATS orchestrator for Lyday Talent Partners.\\n\\n\${GINA_TEAM_RULES}\`;`;
    return insertAfterRulesOrImports(
      next,
      decl,
      "built SYSTEM_PROMPT from GINA_TEAM_RULES",
    );
  }

  const fallback = kitFallbackPrompt();
  return insertAfterRulesOrImports(next, fallback, "injected kit fallback SYSTEM_PROMPT");
}

function insertAfterNamedConst(src, name, decl, reason) {
  // Match start of const/let/var name =
  const re = new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*=`);
  const m = src.match(re);
  if (!m) return insertAfterRulesOrImports(src, decl, reason);

  const start = m.index;
  let i = start + m[0].length;
  while (src[i] === " " || src[i] === "\n" || src[i] === "\r" || src[i] === "\t") {
    i += 1;
  }
  const quote = src[i];
  if (quote === "`" || quote === '"' || quote === "'") {
    i += 1;
    while (i < src.length) {
      const ch = src[i];
      if (ch === "\\") {
        i += 2;
        continue;
      }
      i += 1;
      if (ch === quote) break;
    }
    while (src[i] === " " || src[i] === "\n" || src[i] === "\r") i += 1;
    if (src[i] === ";") i += 1;
    const next = src.slice(0, i) + "\n" + decl + "\n" + src.slice(i);
    return { src: next, changed: true, reason };
  }
  const end = src.indexOf(";", i);
  if (end !== -1 && end - start < 8000) {
    const next = src.slice(0, end + 1) + "\n" + decl + "\n" + src.slice(end + 1);
    return { src: next, changed: true, reason };
  }
  return insertAfterRulesOrImports(src, decl, reason);
}

function insertAfterRulesOrImports(src, decl, reason) {
  let next = src;
  // Place after GINA_TEAM_RULES if present (avoid TDZ when decl uses it)
  const rulesMatch = next.match(/\b(?:const|let|var)\s+GINA_TEAM_RULES\s*=\s*`/);
  if (rulesMatch && /\$\{GINA_TEAM_RULES\}/.test(decl)) {
    // Find end of GINA_TEAM_RULES template
    const start = rulesMatch.index;
    let i = start + rulesMatch[0].length;
    while (i < next.length) {
      if (next[i] === "\\" ) {
        i += 2;
        continue;
      }
      if (next[i] === "`") {
        i += 1;
        while (next[i] === ";" || next[i] === "\n" || next[i] === "\r" || next[i] === " ") {
          if (next[i] === ";") {
            i += 1;
            break;
          }
          i += 1;
        }
        next = next.slice(0, i) + "\n\n" + decl + "\n" + next.slice(i);
        return { src: next, changed: true, reason };
      }
      i += 1;
    }
  }

  if (/^import .+$/m.test(next)) {
    const last = [...next.matchAll(/^import .+$/gm)].pop();
    const idx = last.index + last[0].length;
    // Prefer after Anthropic client block if present soon after imports
    next = next.slice(0, idx) + "\n\n" + decl + "\n" + next.slice(idx);
  } else {
    next = decl + "\n\n" + next;
  }
  return { src: next, changed: true, reason };
}

// --- main ---
console.log("Gina dir:", ginaDir);
console.log("Mode:", diagnoseOnly ? "diagnose" : force ? "force-fix" : "fix");

let src = fs.readFileSync(ginaPath, "utf8");
if (!usesSystemPrompt(src)) {
  console.log("gina.js does not reference SYSTEM_PROMPT — nothing to do.");
  process.exit(0);
}

console.log(
  "SYSTEM_PROMPT used:",
  true,
  "| binding:",
  hasSystemPromptBinding(src) ? "yes" : "MISSING",
);

if (hasSystemPromptBinding(src) && !force) {
  console.log("OK: SYSTEM_PROMPT already defined.");
  process.exit(0);
}

const result = injectBinding(src);
if (!result.changed) {
  console.log("SKIP:", result.reason);
  process.exit(0);
}

const check = canParse(ginaPath, result.src);
if (!check.ok) {
  console.error("REFUSING: fix would not parse");
  console.error(check.err.split("\n").slice(0, 8).join("\n"));
  process.exit(2);
}

if (diagnoseOnly) {
  console.log("WOULD FIX:", result.reason);
  process.exit(3);
}

const bak = `${ginaPath}.bak-sysprompt-${Date.now()}`;
fs.copyFileSync(ginaPath, bak);
fs.writeFileSync(ginaPath, result.src, "utf8");
console.log("Fixed:", result.reason);
console.log("Backup:", bak);

const verify = fs.readFileSync(ginaPath, "utf8");
if (usesSystemPrompt(verify) && !hasSystemPromptBinding(verify)) {
  console.error("FAILED: still missing SYSTEM_PROMPT binding");
  process.exit(2);
}
if (!canParse(ginaPath, verify).ok) {
  console.error("FAILED: gina.js does not parse after fix");
  process.exit(2);
}

console.log(`
OK: SYSTEM_PROMPT is defined.

Next (one line each):
  node --check ${ginaPath}
  cd ~/lyday-gina-backend
  git add -u gina-backend
  git status
  git commit -m "Fix SYSTEM_PROMPT is not defined in Gina chat"
  git pull origin main --rebase
  git push origin main

Wait for Railway, then re-ask Gina to queue Maria.
`);
