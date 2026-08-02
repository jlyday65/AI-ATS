#!/usr/bin/env node
/**
 * Fix: Skipped action N: Unknown action type "command_agent"
 *      Skipped action N: Unknown action type "source_candidates_signalhire"
 *
 * Restores applyAgentAction handlers + /ats/run-command support.
 * esbuild-gated. Also ensures Check for actions awaits applyAgentAction.
 *
 * ONE LINE:
 *   node gina-express/frontend/patch-check-for-actions.mjs ~/lyday-gina-backend/gina-backend
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.join(__dirname, "..");
const rootArg = String(process.argv[2] || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");
const root = path.resolve(rootArg);
const ginaDir = fs.existsSync(path.join(root, "frontend", "src", "App.jsx"))
  ? root
  : fs.existsSync(path.join(root, "gina-backend", "frontend", "src", "App.jsx"))
    ? path.join(root, "gina-backend")
    : root;

const appPath = path.join(ginaDir, "frontend", "src", "App.jsx");
if (!fs.existsSync(appPath)) {
  console.error(
    "Usage (one line): node patch-check-for-actions.mjs ~/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

function copy(rel) {
  const src = path.join(pkg, rel);
  const dest = path.join(ginaDir, rel);
  if (!fs.existsSync(src)) {
    console.warn("Skip missing:", rel);
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log("Copied", rel);
}

copy("routes/run-command.js");
copy("routes/kimberley-notes.js");
copy("agents/command-agent.tool.js");
copy("agents/bot-replies.js");
copy("agents/registry.js");
copy("agents/candidate-file.tool.js");
copy("lib/kimberley-notes.js");
copy("lib/candidate-files.js");
copy("maria-source.tool.js");

// Ensure server mounts /ats/run-command
const serverPath = path.join(ginaDir, "server.js");
if (fs.existsSync(serverPath)) {
  let server = fs.readFileSync(serverPath, "utf8");
  const sbak = `${serverPath}.bak-run-command-${Date.now()}`;
  let changed = false;
  if (!/run-command\.js|runCommandRouter|run-command/.test(server)) {
    if (/^import\s+/m.test(server)) {
      server =
        `import runCommandRouter from "./routes/run-command.js";\n` + server;
    } else {
      server =
        `const runCommandRouter = require("./routes/run-command.js");\n` +
        server;
    }
    if (/const\s+app\s*=\s*express\s*\(/.test(server)) {
      server = server.replace(
        /(const\s+app\s*=\s*express\s*\(\s*\)\s*;?)/,
        `$1\napp.use("/ats", runCommandRouter);`,
      );
    } else if (/app\.listen\s*\(/.test(server)) {
      server = server.replace(
        /app\.listen\s*\(/,
        `app.use("/ats", runCommandRouter);\napp.listen(`,
      );
    } else {
      server += `\napp.use("/ats", runCommandRouter);\n`;
    }
    changed = true;
    console.log("Mounted /ats/run-command on server.js");
  } else if (!/app\.use\(\s*["']\/ats["']\s*,\s*runCommandRouter/.test(server) && /import runCommandRouter/.test(server) === false) {
    // import might exist under another name — leave alone
  }
  // If import exists but no mount:
  if (
    /routes\/run-command\.js/.test(server) &&
    !/app\.use\(\s*["']\/ats["'].*runCommand|run-command/.test(
      server.split("import").slice(1).join("import"),
    ) &&
    !/app\.use\(\s*["']\/ats["']\s*,\s*runCommandRouter/.test(server)
  ) {
    // try add mount if missing
    if (!/runCommandRouter/.test(server) && /from\s*["']\.\/routes\/run-command\.js["']/.test(server)) {
      // has default import under another name — skip
    } else if (/runCommandRouter/.test(server) && !/app\.use\(\s*["']\/ats["']\s*,\s*runCommandRouter/.test(server)) {
      server = server.replace(
        /(const\s+app\s*=\s*express\s*\(\s*\)\s*;?)/,
        `$1\napp.use("/ats", runCommandRouter);`,
      );
      changed = true;
    }
  }
  if (changed) {
    fs.copyFileSync(serverPath, sbak);
    fs.writeFileSync(serverPath, server, "utf8");
    console.log("Backup server:", sbak);
  } else {
    console.log("server.js already references run-command");
  }
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

function braceEnd(src, braceAt) {
  let depth = 0;
  for (let j = braceAt; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") {
      depth--;
      if (depth === 0) return j + 1;
    }
  }
  return -1;
}

const CLEAN = `
  const BOT_NAMES = new Set(["maria", "michelle", "kelley", "kelly", "ashton", "gina"]);

  function isBotMatch(match) {
    const name = String(match?.name || match?.fullName || "").trim().toLowerCase();
    return Boolean(name) && BOT_NAMES.has(name);
  }

  function resolveTeamBotName(raw) {
    const text = String(raw || "").trim().toLowerCase();
    if (!text) return null;
    const first = text.split(/[\\s(,:@<]/).find(Boolean) || "";
    const key = first.replace(/[^a-z]/g, "");
    if (BOT_NAMES.has(key)) return key === "kelly" ? "kelley" : key;
    for (const bot of BOT_NAMES) {
      if (text === bot || text.startsWith(bot + " ") || text.includes(" " + bot + " ")) {
        return bot === "kelly" ? "kelley" : bot;
      }
    }
    return null;
  }

  function isEmailActionType(type) {
    const t = String(type || "").toLowerCase();
    return (
      t === "send_email" ||
      t === "queue_email" ||
      t === "compose_email" ||
      t === "draft_email" ||
      t === "email" ||
      /email/.test(t)
    );
  }

  async function applyAgentAction(action) {
    const { type, payload } = action;
    try {
      // Never email team bots — rewrite to command_agent
      if (isEmailActionType(type)) {
        const toRaw =
          payload?.to ||
          payload?.recipient ||
          payload?.toName ||
          payload?.name ||
          payload?.match?.name ||
          payload?.agent ||
          "";
        const bot = resolveTeamBotName(toRaw);
        if (bot && bot !== "gina") {
          const subject = String(payload?.subject || "").trim();
          const body = String(
            payload?.body ||
              payload?.text ||
              payload?.message ||
              payload?.task ||
              "",
          ).trim();
          const task = [
            "Provide a status update for Kimberley.",
            subject ? \`Topic: \${subject}\` : "",
            body && body !== subject ? body : "",
            "Do not start a new candidate search unless Kimberley explicitly asked to source.",
          ]
            .filter(Boolean)
            .join(" ");
          const res = await fetch("/ats/run-command", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              type: "command_agent",
              actionId: action.id,
              payload: {
                targetAgent: bot,
                task: String(task),
                requestedBy: "Kimberley",
              },
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data.ok === false) {
            return {
              ok: false,
              reason:
                data.error ||
                \`Refused email to \${bot} (team bot). Use command_agent + Check for actions.\`,
            };
          }
          return {
            ok: true,
            summary:
              data.summary ||
              \`Did not email \${bot} (internal bot). Ran team command instead — see Kimberley's Notes.\`,
          };
        }
      }

      if (
        type === "command_agent" ||
        type === "source_candidates_signalhire" ||
        type === "create_candidate_file"
      ) {
        const res = await fetch("/ats/run-command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            type,
            actionId: action.id,
            payload: payload || {},
            action,
            summary: action.summary || action.detail || action.notes || "",
            taskHint: [
              action.summary,
              action.detail,
              action.notes,
              action.description,
              action.task,
              typeof action.payload === "string"
                ? action.payload
                : JSON.stringify(action.payload || {}),
              typeof payload === "string" ? payload : JSON.stringify(payload || {}),
            ]
              .filter(Boolean)
              .join("\\n"),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) {
          const dbg = data.debug ? \` | debug: \${JSON.stringify(data.debug)}\` : "";
          return {
            ok: false,
            reason:
              (data.error ||
                data.reason ||
                data.summary ||
                data.message ||
                data.result?.error ||
                \`Command failed (\${res.status})\`) + dbg,
          };
        }
        return {
          ok: true,
          summary:
            data.summary ||
            (data.reply
              ? \`\${data.result?.agent || "Team"} replied — see Kimberley's Notes\`
              : "Team command executed"),
          kimberleyNoteId: data.kimberleyNoteId || null,
          reply: data.reply || null,
        };
      }

      if (
        (type === "update_stage" || type === "add_note") &&
        isBotMatch(payload?.match)
      ) {
        const bot = String(payload.match.name || "").trim();
        const task =
          payload.text ||
          payload.task ||
          payload.note ||
          \`Command for \${bot}\`;
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
              \`Bot command for \${bot} failed — is /ats/run-command mounted?\`,
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
              (prev || []).map((c) => (c.id === existing.id ? { ...c, ...patch } : c)),
            );
          }
          return { ok: true, summary: \`Updated \${existing.name} with resume/role from import\` };
        }
        let jobId = payload.jobId || null;
        if (!jobId && payload.jobTitle) {
          const job = jobs.find(
            (j) =>
              (j.title || "").trim().toLowerCase() ===
              String(payload.jobTitle).trim().toLowerCase(),
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
        const match = findCandidateByMatch({
          ...(payload?.match || {}),
          email: payload?.match?.email || payload?.email || "",
          phone: payload?.match?.phone || payload?.phone || "",
          jobTitle:
            payload?.match?.jobTitle ||
            payload?.match?.role ||
            payload?.jobTitle ||
            payload?.role ||
            "",
        });
        if (!match) return { ok: false, reason: \`No candidate found matching \${JSON.stringify(payload?.match)}.\` };
        if (match.ambiguous) return { ok: false, reason: \`\${match.count} candidates share that name — re-queue with match.email, or clear duplicate names on the Board.\` };
        if (!STAGES.some((s) => s.key === payload?.stage)) return { ok: false, reason: \`"\${payload?.stage}" isn't a valid stage.\` };
        setStage(match.id, payload.stage);
        return { ok: true, summary: \`Moved \${match.name} to \${stageMeta(payload.stage).label}\` };
      }

      if (type === "add_note") {
        const match = findCandidateByMatch({
          ...(payload?.match || {}),
          email: payload?.match?.email || payload?.email || "",
          phone: payload?.match?.phone || payload?.phone || "",
          jobTitle:
            payload?.match?.jobTitle ||
            payload?.match?.role ||
            payload?.jobTitle ||
            payload?.role ||
            "",
        });
        if (!match) return { ok: false, reason: \`No candidate found matching \${JSON.stringify(payload?.match)}.\` };
        if (match.ambiguous) return { ok: false, reason: \`\${match.count} candidates share that name — re-queue with match.email, or clear duplicate names on the Board.\` };
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

let src = fs.readFileSync(appPath, "utf8");
const bak = `${appPath}.bak-check-actions-${Date.now()}`;
fs.copyFileSync(appPath, bak);

const esbuild = loadEsbuild();
const before = canCompile(esbuild, src);
if (!before.ok) {
  console.error("App.jsx does not compile before patch:", before.error);
  console.error("Run nuclear-restore-app-jsx.mjs first, then re-run this patch.");
  process.exit(2);
}

// Remove existing BOT_NAMES + applyAgentAction blocks (keep one clean copy)
for (let guard = 0; guard < 8; guard++) {
  const bot = src.search(/const BOT_NAMES\s*=\s*new Set/);
  const fnAt = src.search(/(?:async\s+)?function\s+(?:await\s+)?applyAgentAction\b/);
  if (bot < 0 && fnAt < 0) break;
  if (fnAt < 0) {
    // orphan BOT_NAMES (+ optional isBotMatch)
    const isBot = src.search(/function\s+isBotMatch\b/);
    let end = src.indexOf(";", bot);
    if (isBot > bot && isBot - bot < 200) {
      const braceAt = src.indexOf("{", isBot);
      const be = braceEnd(src, braceAt);
      if (be > 0) end = be - 1;
    }
    if (end > bot) src = src.slice(0, bot) + "\n" + src.slice(end + 1);
    continue;
  }
  let start = fnAt;
  if (bot >= 0 && bot < fnAt && fnAt - bot < 500) start = bot;
  const braceAt = src.indexOf("{", fnAt);
  const end = braceEnd(src, braceAt);
  if (end < 0) {
    console.error("Could not find end of applyAgentAction");
    process.exit(2);
  }
  src = src.slice(0, start) + "\n" + src.slice(end);
}

function insertClean(srcText, clean) {
  // Prefer AFTER findCandidateByMatch (usually inside App, near other helpers)
  const findAt = srcText.search(/function\s+findCandidateByMatch\b/);
  if (findAt >= 0) {
    const braceAt = srcText.indexOf("{", findAt);
    const end = braceEnd(srcText, braceAt);
    if (end > 0) {
      return srcText.slice(0, end) + "\n\n" + clean + "\n" + srcText.slice(end);
    }
  }

  // Else: inside App / CandidateTracker, just before `return (`
  const host =
    srcText.search(/export\s+default\s+function\s+(?:App|CandidateTracker)\b/) >= 0
      ? srcText.search(/export\s+default\s+function\s+(?:App|CandidateTracker)\b/)
      : srcText.search(/function\s+(?:App|CandidateTracker)\b/);
  if (host >= 0) {
    const hostBrace = srcText.indexOf("{", host);
    if (hostBrace >= 0) {
      const hostEnd = braceEnd(srcText, hostBrace);
      const body = srcText.slice(hostBrace, hostEnd);
      // last top-level-ish `return (` in the host (prefer before final return JSX)
      const returnRe = /\n(\s*)return\s*\(/g;
      let last = null;
      let m;
      while ((m = returnRe.exec(body))) last = m;
      if (last && last.index > 0) {
        const at = hostBrace + last.index;
        return (
          srcText.slice(0, at) +
          "\n\n" +
          clean +
          "\n" +
          srcText.slice(at)
        );
      }
    }
  }

  return srcText + "\n" + clean + "\n";
}

src = insertClean(src, CLEAN);

// Call sites only — NEVER rewrite `async function applyAgentAction(action)`
// (old lookbehind `(?<!await\s)` alone produced: Expected "(" but found "applyAgentAction")
src = src.replace(
  /async\s+function\s+await\s+applyAgentAction/g,
  "async function applyAgentAction",
);
src = src.replace(
  /(?<!function\s)(?<!async\s+function\s)(?<!await\s)\bapplyAgentAction\s*\(\s*action\s*\)/g,
  "await applyAgentAction(action)",
);
src = src.replace(/await\s+await\s+applyAgentAction/g, "await applyAgentAction");

if (/async\s+function\s+await\s+applyAgentAction/.test(src)) {
  console.error("REFUSING: await rewriter corrupted applyAgentAction declaration");
  fs.copyFileSync(bak, appPath);
  process.exit(2);
}

if (!/type === "command_agent"/.test(src) && !/type === 'command_agent'/.test(src)) {
  console.error("REFUSING: command_agent handler missing after insert");
  process.exit(2);
}

const after = canCompile(esbuild, src);
if (!after.ok) {
  console.error("REFUSING: App.jsx would not compile:", after.error);
  fs.copyFileSync(bak, appPath);
  process.exit(2);
}

fs.writeFileSync(appPath, src, "utf8");
console.log("OK: Check for actions handles command_agent + source_candidates_signalhire");
console.log("Backup:", bak);
console.log("Wrote:", appPath);

// Quick syntax check on run-command
const rc = path.join(ginaDir, "routes/run-command.js");
if (fs.existsSync(rc)) {
  const chk = spawnSync(process.execPath, ["--check", rc], { encoding: "utf8" });
  if (chk.status !== 0) {
    console.warn("Warning: routes/run-command.js --check failed:", chk.stderr);
  }
}

console.log(`
Next:
  node gina-express/frontend/patch-ats-toolbar-links.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
  node gina-express/frontend/patch-bot-nav-branding.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend
  git add gina-backend/frontend/src/App.jsx gina-backend/routes/run-command.js gina-backend/agents gina-backend/lib gina-backend/maria-source.tool.js gina-backend/server.js
  git status
  git commit -m "Fix Check for actions: handle command_agent and Maria sourcing"
  git pull origin main --rebase
  git push origin main

After redeploy: Gina → Check for actions
Expect Kelley/Maria actions to run (not "Unknown action type").
Then open Kimberley Notes.
`);
