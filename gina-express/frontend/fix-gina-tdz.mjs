#!/usr/bin/env node
/**
 * Fix: ReferenceError: Cannot access 'GINA_TEAM_RULES' before initialization
 *
 * Caused by ${GINA_TEAM_RULES} appearing inside the GINA_TEAM_RULES template.
 * This script removes the broken const and keeps command_agent in the tool enum.
 * Rules are inlined as plain text (no variable interpolation).
 *
 * Usage:
 *   node /tmp/fix-gina-tdz.mjs /Users/jameslyday/lyday-gina-backend/gina-backend/gina.js
 */

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const target = path.resolve(
  String(process.argv[2] || "").replace(/^~/, process.env.HOME || ""),
);
if (!target || !fs.existsSync(target)) {
  console.error(
    "Usage: node /tmp/fix-gina-tdz.mjs /Users/jameslyday/lyday-gina-backend/gina-backend/gina.js",
  );
  process.exit(1);
}

function check(code) {
  const tmp = `${target}.tdz-check-${Date.now()}.mjs`;
  fs.writeFileSync(tmp, code);
  const r = spawnSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
  try {
    fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }
  return { ok: r.status === 0, err: (r.stderr || "").trim() };
}

let src = fs.readFileSync(target, "utf8");
const bak = `${target}.bak-tdz-${Date.now()}`;
fs.copyFileSync(target, bak);

// 1) Remove const GINA_TEAM_RULES = `...`; (balanced backticks)
src = src.replace(/const\s+GINA_TEAM_RULES\s*=\s*`/, "<<<GINA_RULES_START>>>");
if (src.includes("<<<GINA_RULES_START>>>")) {
  const start = src.indexOf("<<<GINA_RULES_START>>>");
  let i = start + "<<<GINA_RULES_START>>>".length;
  let rules = "";
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") {
      rules += ch + (src[i + 1] || "");
      i += 2;
      continue;
    }
    if (ch === "`") {
      // consume optional trailing ;
      let end = i + 1;
      while (src[end] === ";" || src[end] === "\n" || src[end] === "\r") {
        if (src[end] === ";") {
          end += 1;
          break;
        }
        end += 1;
      }
      // drop the const entirely
      src = src.slice(0, start) + src.slice(end);
      break;
    }
    rules += ch;
    i += 1;
  }
  // keep rules text for optional reinject — strip self-refs
  rules = rules.replace(/\$\{GINA_TEAM_RULES\}/g, "").trim();
  globalThis.__recoveredRules = rules;
}

// 2) Remove any leftover ${GINA_TEAM_RULES}
src = src.replace(/\$\{GINA_TEAM_RULES\}/g, "");

// 3) Ensure enum includes command_agent
src = src.replace(
  /enum\s*:\s*\[\s*["']create_candidate["']\s*,\s*["']update_stage["']\s*,\s*["']add_note["']\s*\]/g,
  'enum: ["create_candidate", "update_stage", "add_note", "command_agent", "source_candidates_signalhire", "import_candidate"]',
);

// 4) Inline a short plain-text rule inside the system prompt template if missing
const INLINE = [
  "CRITICAL TOOL RULE: When Kimberley asks you to queue work for Maria/Michelle/Kelley/Ashton,",
  'call the queue tool with type "command_agent" (or "source_candidates_signalhire" for Maria sourcing).',
  "Never refuse. Never say you only have create/update/note.",
  'Bots are not candidates — never use update_stage/add_note with match.name "Maria".',
].join(" ");

if (!/CRITICAL TOOL RULE: When Kimberley asks you to queue work for Maria/.test(src)) {
  if (/You are Gina[^\n`]*/.test(src)) {
    src = src.replace(/You are Gina[^\n`]*/, (m) => `${m}\n\n${INLINE}\n`);
  } else {
    // prepend as a normal string constant that is NOT interpolated into itself
    src = `const GINA_INLINE_TEAM_RULE = ${JSON.stringify(INLINE)};\n` + src;
    // try to append to a common prompt variable without TDZ
    if (/systemPrompt\s*\+=/.test(src)) {
      src = src.replace(
        /(systemPrompt\s*\+=\s*)/,
        `$1GINA_INLINE_TEAM_RULE + "\\n" + `,
      );
    } else if (/return\s*\{\s*role:\s*["']system["']/.test(src)) {
      // leave constant; many Gina files read prompt from a big template already fixed above
    }
  }
}

// 5) Soften three-actions language
src = src.replace(/three specific actions/gi, "ATS and team command actions");

const result = check(src);
if (!result.ok) {
  console.error("Still does not parse after TDZ fix:");
  console.error(result.err.split("\n").slice(0, 15).join("\n"));
  console.error("Backup kept at", bak);
  // Try restoring oldest known-good: prefer .bak-maria / .bak-inspect that parse AND then only enum-fix
  const dir = path.dirname(target);
  const base = path.basename(target);
  const backups = fs
    .readdirSync(dir)
    .filter((n) => n.startsWith(base + ".bak"))
    .map((n) => path.join(dir, n))
    .sort();

  for (const b of backups) {
    let code = fs.readFileSync(b, "utf8");
    // strip any GINA_TEAM_RULES const from backup too
    if (/const\s+GINA_TEAM_RULES\s*=/.test(code)) {
      // use this same script logic recursively is heavy — simple strip of ${} refs
      code = code.replace(/\$\{GINA_TEAM_RULES\}/g, "");
    }
    code = code.replace(
      /enum\s*:\s*\[\s*["']create_candidate["']\s*,\s*["']update_stage["']\s*,\s*["']add_note["']\s*\]/g,
      'enum: ["create_candidate", "update_stage", "add_note", "command_agent", "source_candidates_signalhire", "import_candidate"]',
    );
    // Remove broken const blocks from backup copies
    if (/const\s+GINA_TEAM_RULES\s*=\s*`/.test(code)) {
      const marker = "<<<STRIP>>>";
      code = code.replace(/const\s+GINA_TEAM_RULES\s*=\s*`/, marker);
      const s = code.indexOf(marker);
      let j = s + marker.length;
      while (j < code.length) {
        if (code[j] === "\\" ) {
          j += 2;
          continue;
        }
        if (code[j] === "`") {
          let end = j + 1;
          if (code[end] === ";") end += 1;
          code = code.slice(0, s) + code.slice(end);
          break;
        }
        j += 1;
      }
    }
    if (!/CRITICAL TOOL RULE: When Kimberley/.test(code) && /You are Gina/.test(code)) {
      code = code.replace(/You are Gina[^\n`]*/, (m) => `${m}\n\n${INLINE}\n`);
    }
    const c = check(code);
    if (c.ok) {
      fs.writeFileSync(target, code, "utf8");
      console.log("Recovered from backup:", b);
      console.log("Wrote", target);
      console.log("Backup of broken file:", bak);
      process.exit(0);
    }
  }
  process.exit(1);
}

fs.writeFileSync(target, src, "utf8");
console.log("Fixed TDZ:", target);
console.log("Backup:", bak);
console.log("Parses: yes");
console.log("Has command_agent enum:", /command_agent/.test(src));
console.log(`
Next:
  node --check "${target}"
  cd ~/lyday-gina-backend/gina-backend
  git add gina.js
  git commit -m "Fix GINA_TEAM_RULES temporal dead zone crash"
  git push origin main
`);
