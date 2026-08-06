#!/usr/bin/env node
/**
 * Repair App.jsx after a bad applyAgentAction patch left comment "*" lines
 * inside the function (Vite: Unexpected "*").
 *
 * Usage:
 *   node /tmp/repair-app-jsx-apply-action.mjs \
 *     /Users/jameslyday/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 */

import fs from "fs";
import path from "path";

const target = path.resolve(
  String(process.argv[2] || "").replace(/^~/, process.env.HOME || ""),
);
if (!target || !fs.existsSync(target)) {
  console.error(
    "Usage: node /tmp/repair-app-jsx-apply-action.mjs /Users/.../frontend/src/App.jsx",
  );
  process.exit(1);
}

const CLEAN_FN = `
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
          body: JSON.stringify({
            type,
            actionId: action.id,
            payload: payload || {},
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) {
          return {
            ok: false,
            reason: data.error || data.reason || \`Command failed (\${res.status})\`,
          };
        }
        return { ok: true, summary: data.summary || "Team command executed" };
      }

      if (
        (type === "update_stage" || type === "add_note") &&
        isBotMatch(payload?.match)
      ) {
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
            reason:
              data.error ||
              \`Bot command for \${bot} failed. Mount routes/run-command.js and set SIGNALHIRE_BASE_URL.\`,
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
            (j) => (j.title || "").trim().toLowerCase() === String(payload.jobTitle).trim().toLowerCase()
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

let src = fs.readFileSync(target, "utf8");
const bak = `${target}.bak-apply-${Date.now()}`;
fs.copyFileSync(target, bak);

// Find start: BOT_NAMES, isBotMatch, or applyAgentAction (including broken)
const startRe =
  /(?:const BOT_NAMES\s*=\s*new Set\([\s\S]*?\)\s*;\s*)?(?:function isBotMatch\([\s\S]*?\}\s*)?(?:async\s+)?function applyAgentAction\s*\([^)]*\)\s*\{/;
const m = src.match(startRe);
if (!m) {
  // Broader: any applyAgentAction then junk
  const idx = src.search(/(?:async\s+)?function applyAgentAction\b/);
  if (idx < 0) {
    console.error("Could not find applyAgentAction in", target);
    process.exit(1);
  }
  // Delete from idx until we hit a clean top-level function after a lot of junk,
  // or until "function " at column 0/2 that isn't applyAgentAction
  let i = idx;
  // If broken comments with * follow, skip until we find a balanced-ish end or next real function
  const nextFn = src.slice(idx + 10).search(/\n(?:  )?(?:async )?function [A-Z]/);
  const cutEnd =
    nextFn >= 0
      ? idx + 10 + nextFn
      : (() => {
          // try brace match from first {
          const brace = src.indexOf("{", idx);
          let depth = 0;
          for (let j = brace; j < src.length; j++) {
            if (src[j] === "{") depth++;
            else if (src[j] === "}") {
              depth--;
              if (depth === 0) return j + 1;
            }
          }
          return -1;
        })();
  if (cutEnd < 0) {
    console.error("Could not locate end of broken applyAgentAction block");
    process.exit(1);
  }
  src = src.slice(0, idx) + "\n  " + CLEAN_FN + "\n" + src.slice(cutEnd);
} else {
  const start = m.index;
  // Prefer cutting from BOT_NAMES if present just before
  let cutStart = start;
  const before = src.slice(Math.max(0, start - 120), start);
  const bot = before.lastIndexOf("const BOT_NAMES");
  if (bot >= 0) cutStart = Math.max(0, start - 120) + bot;

  // Find end of applyAgentAction by brace matching from its {
  const fnHead = src.slice(cutStart).match(/(?:async\s+)?function applyAgentAction\s*\([^)]*\)\s*\{/);
  if (!fnHead) {
    console.error("internal: lost applyAgentAction head");
    process.exit(1);
  }
  const absBrace = cutStart + fnHead.index + fnHead[0].lastIndexOf("{");
  let depth = 0;
  let end = -1;
  // If the body is corrupted with comments, braces may not balance.
  // Strategy: from absBrace, scan; if we see many lines starting with * or comment junk,
  // jump to next real function declaration.
  let junk = false;
  for (let j = absBrace; j < Math.min(src.length, absBrace + 8000); j++) {
    const slice = src.slice(j, j + 80);
    if (/\n\s+\* (Replace|IMPORTANT|Fixes)/.test(slice) || /\n\s+\* In Gina/.test(slice)) {
      junk = true;
    }
    if (src[j] === "{") depth++;
    else if (src[j] === "}") {
      depth--;
      if (depth === 0) {
        end = j + 1;
        break;
      }
    }
  }

  if (junk || end < 0) {
    const rest = src.slice(cutStart + 1);
    const nextFn = rest.search(/\n(?:  )?(?:async )?function [A-Za-z]/);
    if (nextFn >= 0) {
      end = cutStart + 1 + nextFn;
    }
  }

  if (end < 0) {
    console.error("Could not find end of applyAgentAction; restore from backup and retry");
    process.exit(1);
  }

  // Also remove trailing orphaned isBotMatch/BOT_NAMES duplicates after insert later — for now cut clean
  src = src.slice(0, cutStart) + "\n  " + CLEAN_FN + "\n" + src.slice(end);
}

// Call sites only — never touch `async function applyAgentAction(action)`
src = src.replace(
  /(?<!function )(?<!await )applyAgentAction\s*\(\s*action\s*\)/g,
  "await applyAgentAction(action)",
);
if (/async function await applyAgentAction/.test(src)) {
  console.error("Refusing: await rewriter corrupted the function declaration");
  process.exit(1);
}

fs.writeFileSync(target, src, "utf8");
console.log("Repaired:", target);
console.log("Backup:", bak);
console.log(`
Next:
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend/gina-backend
  git add frontend/src/App.jsx routes/run-command.js agents server.js maria-source.tool.js
  git commit -m "Fix applyAgentAction for source_candidates_signalhire"
  git push origin main
`);
