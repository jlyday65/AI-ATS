#!/usr/bin/env node
/**
 * Nuclear fix for App.jsx corrupted by applyAgentAction comment paste.
 *
 * 1) Prefers a clean backup that does NOT contain "Replace the ENTIRE function"
 * 2) Strips any leftover comment junk
 * 3) Replaces applyAgentAction with a clean async implementation
 *
 * Usage:
 *   node /tmp/nuke-fix-app-jsx.mjs \
 *     /Users/jameslyday/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 */

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const target = path.resolve(
  String(process.argv[2] || "").replace(/^~/, process.env.HOME || ""),
);
if (!target || !fs.existsSync(target)) {
  console.error(
    "Usage: node /tmp/nuke-fix-app-jsx.mjs /Users/.../frontend/src/App.jsx",
  );
  process.exit(1);
}

const CLEAN = `
  const BOT_NAMES = new Set(["maria", "michelle", "kelley", "kelly", "ashton", "gina"]);

  function isBotMatch(match) {
    const name = String(match?.name || match?.fullName || "").trim().toLowerCase();
    return Boolean(name) && BOT_NAMES.has(name);
  }

  async function applyAgentAction(action) {
    const { type, payload } = action;
    try {
      if (type === "command_agent" || type === "source_candidates_signalhire") {
        const res = await fetch("/ats/run-command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ type, actionId: action.id, payload: payload || {} }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) {
          return { ok: false, reason: data.error || data.reason || \`Command failed (\${res.status})\` };
        }
        return { ok: true, summary: data.summary || "Team command executed" };
      }

      if ((type === "update_stage" || type === "add_note") && isBotMatch(payload?.match)) {
        const bot = String(payload.match.name || "").trim();
        const task = payload.text || payload.task || payload.note || \`Command for \${bot}\`;
        const res = await fetch("/ats/run-command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            type: "command_agent",
            actionId: action.id,
            payload: {
              targetAgent: bot,
              task,
              requestedBy: "Kimberley",
              resumesRequired: /resume/i.test(String(task)),
            },
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) {
          return {
            ok: false,
            reason: data.error || \`Bot command for \${bot} failed. Mount /ats/run-command and set SIGNALHIRE_BASE_URL.\`,
          };
        }
        return { ok: true, summary: data.summary || \`Ran command for \${bot}\` };
      }

      if (type === "create_candidate" || type === "import_candidate") {
        if (!payload?.name) return { ok: false, reason: "Missing candidate name in payload." };
        const email = (payload.email || "").trim().toLowerCase();
        const name = (payload.name || "").trim().toLowerCase();
        const existing = candidates.find((c) => {
          if (email && (c.email || "").trim().toLowerCase() === email) return true;
          if (name && (c.name || "").trim().toLowerCase() === name) return true;
          return false;
        });
        if (existing) {
          const resumeText =
            payload.resumeText || payload.resume_text || payload.summary || "";
          const role = payload.jobTitle || payload.role || existing.role || "";
          const patch = {
            resumeText: resumeText || existing.resumeText || existing.resume_text || "",
            summary: payload.summary || existing.summary || "",
            headline: payload.headline || existing.headline || "",
            role,
            jobTitle: payload.jobTitle || existing.jobTitle || "",
            source: existing.source || payload.source || "SignalHire",
          };
          if (typeof updateCandidate === "function") {
            updateCandidate(existing.id, patch);
          } else if (typeof setCandidates === "function") {
            setCandidates((prev) =>
              (prev || []).map((c) =>
                c.id === existing.id ? { ...c, ...patch } : c,
              ),
            );
          } else {
            return {
              ok: false,
              reason: \`Duplicate \${existing.name} found but board has no setCandidates/updateCandidate to merge resume.\`,
            };
          }
          return {
            ok: true,
            summary: \`Updated \${existing.name} with resume/role from import\`,
          };
        }
        let jobId = payload.jobId || null;
        if (!jobId && payload.jobTitle) {
          const job = jobs.find(
            (j) => (j.title || "").trim().toLowerCase() === String(payload.jobTitle).trim().toLowerCase(),
          );
          if (job) jobId = job.id;
        }
        addCandidate({
          name: payload.name,
          role: payload.jobTitle || payload.role || "",
          email: payload.email || "",
          phone: payload.phone || "",
          source: payload.source || (type === "import_candidate" ? "SignalHire" : "Gina"),
          resumeText: payload.resumeText || payload.resume_text || "",
          summary: payload.summary || "",
          headline: payload.headline || "",
          jobId,
          jobTitle: payload.jobTitle || "",
        });
        return { ok: true, summary: \`Created candidate: \${payload.name}\` };
      }

      if (type === "update_stage") {
        const match = findCandidateByMatch(payload?.match);
        if (!match) return { ok: false, reason: \`No candidate found matching \${JSON.stringify(payload?.match)}.\` };
        if (match.ambiguous) return { ok: false, reason: \`\${match.count} candidates share that name — ask Gina to match by email instead.\` };
        if (!STAGES.some((s) => s.key === payload?.stage)) return { ok: false, reason: \`"\${payload?.stage}" isn't a valid stage.\` };
        setStage(match.id, payload.stage);
        return { ok: true, summary: \`Moved \${match.name} to \${stageMeta(payload.stage).label}\` };
      }

      if (type === "add_note") {
        const match = findCandidateByMatch(payload?.match);
        if (!match) return { ok: false, reason: \`No candidate found matching \${JSON.stringify(payload?.match)}.\` };
        if (match.ambiguous) return { ok: false, reason: \`\${match.count} candidates share that name — ask Gina to match by email instead.\` };
        if (!payload?.text) return { ok: false, reason: "Missing note text in payload." };
        addNote(match.id, payload.text);
        return { ok: true, summary: \`Added a note to \${match.name}\` };
      }

      return { ok: false, reason: \`Unknown action type "\${type}".\` };
    } catch (e) {
      return { ok: false, reason: e.message || String(e) };
    }
  }
`.trim();

const JUNK_LINE =
  /^\s*\*|Replace the ENTIRE function|IMPORTANT: "Check for actions"|command_agent \/ Maria sourcing are async|Fixes: Skipped action|In Gina: frontend|BOT_NAMES = new Set|isBotMatch\(match\)|async function applyAgentAction|function applyAgentAction/;

function stripJunkLines(text) {
  // Remove contiguous corrupted comment/instruction blocks
  const lines = text.split("\n");
  const out = [];
  let skipping = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isJunk =
      /^\s*\*\s?/.test(line) ||
      /Replace the ENTIRE function/.test(line) ||
      /IMPORTANT: "Check for actions"/.test(line) ||
      /call \/ats\/run-command/.test(line) ||
      /Fixes: Skipped action N/.test(line) ||
      /In Gina: frontend\/App\.jsx/.test(line) ||
      /In Gina: frontend\/src\/App\.jsx/.test(line) ||
      (/with this\./.test(line) && /`\)/.test(line));

    if (isJunk) {
      skipping = true;
      continue;
    }
    // also drop orphan lines that are only backticks leftovers from comments
    if (skipping && (/^\s*`\)?\s*with this/.test(line) || /^\s*`\s*$/.test(line))) {
      continue;
    }
    skipping = false;
    out.push(line);
  }
  return out.join("\n");
}

function removeApplyAgentActionBlocks(text) {
  // Remove every applyAgentAction function (and preceding BOT_NAMES/isBotMatch helpers)
  let src = text;
  for (let guard = 0; guard < 10; guard++) {
    const helper = src.search(/const BOT_NAMES\s*=\s*new Set/);
    const fn = src.search(/(?:async\s+)?function applyAgentAction\b/);
    if (fn < 0 && helper < 0) break;
    let start = fn >= 0 ? fn : helper;
    if (helper >= 0 && (fn < 0 || helper < fn)) start = helper;

    // If BOT_NAMES is far from applyAgentAction, only cut applyAgentAction
    if (helper >= 0 && fn >= 0 && fn - helper > 500) start = fn;

    // Find end: next top-level/indented function that is NOT applyAgentAction/isBotMatch
    const from = start;
    const rest = src.slice(from);
    // Prefer brace-matching if it looks like a real function
    const braceAt = rest.indexOf("{");
    let endRel = -1;
    if (braceAt >= 0 && /function applyAgentAction|const BOT_NAMES/.test(rest.slice(0, braceAt + 1))) {
      let depth = 0;
      for (let j = braceAt; j < rest.length; j++) {
        if (rest[j] === "{") depth++;
        else if (rest[j] === "}") {
          depth--;
          if (depth === 0) {
            endRel = j + 1;
            break;
          }
        }
        // Abort brace match if we hit clear junk markers with depth weirdness after 200 chars of stars
        if (j > braceAt + 50 && /\n\s+\* Replace/.test(rest.slice(braceAt, j))) {
          endRel = -1;
          break;
        }
      }
    }
    if (endRel < 0) {
      const m = rest.slice(1).match(/\n(?:  )?(?:async )?function (?!applyAgentAction|isBotMatch)[A-Za-z_]/);
      if (!m) {
        console.error("Could not find end boundary for applyAgentAction cleanup");
        process.exit(1);
      }
      endRel = 1 + m.index;
    }
    src = src.slice(0, from) + src.slice(from + endRel);
  }
  return src;
}

function insertClean(text) {
  const anchors = [
    "\nfunction JobsView",
    "\nfunction ResumeTabPanel",
    "\nfunction ResumeUploadPanel",
    "\nexport default function App",
  ];
  for (const anchor of anchors) {
    const idx = text.indexOf(anchor);
    if (idx >= 0) {
      return text.slice(0, idx) + "\n\n  " + CLEAN + "\n" + text.slice(idx);
    }
  }
  return `${text}\n\n${CLEAN}\n`;
}

function looksCorrupted(text) {
  return (
    /Replace the ENTIRE function/.test(text) ||
    /IMPORTANT: "Check for actions" must/.test(text) ||
    /\n\s+\* command_agent \/ Maria/.test(text)
  );
}

function pickBase() {
  const dir = path.dirname(target);
  const names = fs.readdirSync(dir).filter((n) => n.startsWith("App.jsx"));
  const candidates = names
    .map((n) => path.join(dir, n))
    .filter((p) => fs.statSync(p).isFile())
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  // Prefer newest backup that is NOT corrupted and contains applyAgentAction or candidates
  for (const p of candidates) {
    if (p === target) continue;
    const t = fs.readFileSync(p, "utf8");
    if (looksCorrupted(t)) continue;
    if (!/function applyAgentAction|addCandidate|function App/.test(t)) continue;
    // skip tiny files
    if (t.length < 5000) continue;
    console.log("Using clean base:", p);
    return t;
  }

  // Try git show HEAD / HEAD~1
  const repoGuess = path.resolve(dir, "../..");
  for (const rev of ["HEAD", "HEAD~1", "HEAD~2", "HEAD~3"]) {
    const r = spawnSync("git", ["show", `${rev}:frontend/src/App.jsx`], {
      cwd: repoGuess,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
    if (r.status === 0 && r.stdout && !looksCorrupted(r.stdout) && r.stdout.length > 5000) {
      console.log("Using git", rev, "frontend/src/App.jsx");
      return r.stdout;
    }
  }

  console.log("No clean backup found; cleaning current file in place");
  return fs.readFileSync(target, "utf8");
}

const bak = `${target}.bak-nuke-${Date.now()}`;
fs.copyFileSync(target, bak);

let src = pickBase();
src = stripJunkLines(src);
src = removeApplyAgentActionBlocks(src);
src = stripJunkLines(src); // again after removal
src = insertClean(src);

// await call sites — never rewrite the function declaration itself
src = src.replace(/async\s+function\s+await\s+applyAgentAction/g, "async function applyAgentAction");
src = src.replace(
  /(?<!function\s)(?<!async\s+function\s)(?<!await\s)\bapplyAgentAction\s*\(\s*action\s*\)/g,
  "await applyAgentAction(action)",
);
src = src.replace(/await\s+await\s+applyAgentAction/g, "await applyAgentAction");

if (looksCorrupted(src)) {
  console.error("Still looks corrupted after nuke. Manual restore needed.");
  process.exit(1);
}

fs.writeFileSync(target, src, "utf8");
console.log("Wrote clean App.jsx:", target);
console.log("Backup of previous:", bak);
console.log("Contains source_candidates handler:", /source_candidates_signalhire/.test(src));
console.log("Contains junk comment:", looksCorrupted(src));
console.log(`
Next:
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
`);
