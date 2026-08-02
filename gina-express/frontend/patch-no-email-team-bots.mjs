#!/usr/bin/env node
/**
 * Fix: Gina queued "Email to Maria" instead of command_agent.
 *
 * Team bots (Maria / Michelle / Kelley / Ashton) are NEVER emailed.
 * "Email Maria for an update" → command_agent + Check for actions.
 *
 * ONE LINE:
 *   node gina-express/frontend/patch-no-email-team-bots.mjs ~/lyday-gina-backend/gina-backend
 *
 * Then (frontend intercept for already-queued email actions):
 *   node gina-express/frontend/patch-check-for-actions.mjs ~/lyday-gina-backend/gina-backend
 *   # or this script also patches App.jsx when present
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootArg = String(process.argv[2] || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");
const root = path.resolve(rootArg || process.cwd());
const ginaDir = fs.existsSync(path.join(root, "server.js"))
  ? root
  : fs.existsSync(path.join(root, "gina-backend", "server.js"))
    ? path.join(root, "gina-backend")
    : root;

if (!fs.existsSync(path.join(ginaDir, "server.js")) && !fs.existsSync(path.join(ginaDir, "gina.js"))) {
  console.error(
    "Usage: node patch-no-email-team-bots.mjs ~/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

const NO_EMAIL_RULE = `CRITICAL — NEVER EMAIL TEAM BOTS:
Maria, Michelle, Kelley/Kelly, Ashton, and Gina are INTERNAL agents — never send_email / queue_email / compose_email to them.
When Kimberley says "send an email to Maria" / "email Maria for an update", queue type "command_agent" with targetAgent "maria" (same for michelle/kelley/ashton). Tell Kimberley to run Agent → Check for actions. Ashton outreach is for candidates/clients only, never for Maria/Michelle/Kelley.`;

// Copy latest prompt rule
const promptSrc = path.join(__dirname, "..", "GINA_TEAM_PROMPT_RULE.txt");
const promptDest = path.join(ginaDir, "GINA_TEAM_PROMPT_RULE.txt");
if (fs.existsSync(promptSrc)) {
  fs.copyFileSync(promptSrc, promptDest);
  console.log("Copied GINA_TEAM_PROMPT_RULE.txt");
}

function injectRuleIntoGinaJs() {
  const ginaPath = path.join(ginaDir, "gina.js");
  if (!fs.existsSync(ginaPath)) {
    console.warn("gina.js not found — prompt rule file copied; wire it into Gina's system prompt manually if needed.");
    return;
  }
  let src = fs.readFileSync(ginaPath, "utf8");
  if (/NEVER EMAIL TEAM BOTS/.test(src)) {
    console.log("gina.js already has NEVER EMAIL TEAM BOTS rule");
    return;
  }
  const bak = `${ginaPath}.bak-no-email-${Date.now()}`;
  fs.copyFileSync(ginaPath, bak);

  // Prefer injecting into existing TEAM COMMAND RULE string block
  if (/GINA TEAM COMMAND RULE/.test(src)) {
    src = src.replace(
      /(GINA TEAM COMMAND RULE[\s\S]{0,400}?CRITICAL — bots are NOT candidates:)/,
      `$1\n${NO_EMAIL_RULE}\n`,
    );
    if (!/NEVER EMAIL TEAM BOTS/.test(src)) {
      src = src.replace(
        /(GINA TEAM COMMAND RULE[^`'"]*)/,
        `$1\n${NO_EMAIL_RULE}\n`,
      );
    }
  } else if (/GINA_TEAM_RULES|SYSTEM_PROMPT|systemPrompt/.test(src)) {
    src = src.replace(
      /(const\s+GINA_TEAM_RULES\s*=\s*[`'"])/,
      `$1\n${NO_EMAIL_RULE}\n`,
    );
    if (!/NEVER EMAIL TEAM BOTS/.test(src)) {
      src =
        `const GINA_NO_EMAIL_TEAM_BOTS = ${JSON.stringify(NO_EMAIL_RULE)};\n` +
        src;
      // Append to a known prompt concat if present
      src = src.replace(
        /(GINA_TEAM_RULES\s*\+\s*|SYSTEM_PROMPT\s*\+\s*|systemPrompt\s*\+\s*)/,
        `GINA_NO_EMAIL_TEAM_BOTS + "\\n" + $1`,
      );
    }
  } else {
    src =
      `/* AUTO: never email team bots */\nexport const GINA_NO_EMAIL_TEAM_BOTS = ${JSON.stringify(NO_EMAIL_RULE)};\n` +
      src;
    console.log(
      "Added GINA_NO_EMAIL_TEAM_BOTS export — ensure it is included in Gina's system prompt string.",
    );
  }

  fs.writeFileSync(ginaPath, src, "utf8");
  console.log("Updated gina.js (", path.basename(bak), ")");
}

const EMAIL_HELPERS = `
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
`;

const EMAIL_REWRITE = `
      // Never email team bots — rewrite to command_agent
      if (typeof isEmailActionType === "function" && isEmailActionType(type)) {
        const toRaw =
          payload?.to ||
          payload?.recipient ||
          payload?.toName ||
          payload?.name ||
          payload?.match?.name ||
          payload?.agent ||
          "";
        const bot =
          typeof resolveTeamBotName === "function"
            ? resolveTeamBotName(toRaw)
            : null;
        if (bot && bot !== "gina") {
          const task =
            payload?.body ||
            payload?.text ||
            payload?.message ||
            payload?.subject ||
            payload?.task ||
            "Provide a status update for Kimberley";
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
                "Refused email to " + bot + " (team bot). Use command_agent + Check for actions.",
            };
          }
          return {
            ok: true,
            summary:
              data.summary ||
              "Did not email " + bot + " (internal bot). Ran team command instead — see Kimberley's Notes.",
          };
        }
      }
`;

function loadEsbuild(appFile) {
  const frontend = path.resolve(path.dirname(appFile), "..");
  try {
    const req = createRequire(
      path.join(frontend, "node_modules", "esbuild", "package.json"),
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

function patchAppJsx() {
  const candidates = [
    path.join(ginaDir, "frontend", "src", "App.jsx"),
    path.join(ginaDir, "frontend", "App.jsx"),
  ];
  const appPath = candidates.find((p) => fs.existsSync(p));
  if (!appPath) {
    console.warn("App.jsx not found — skip frontend email rewrite");
    return;
  }

  let src = fs.readFileSync(appPath, "utf8");
  if (/Did not email .* \(internal bot\)/.test(src) || /Never email team bots/.test(src)) {
    console.log("App.jsx already rewrites team-bot emails");
    return;
  }

  if (!/const BOT_NAMES\s*=\s*new Set/.test(src)) {
    console.warn(
      "App.jsx missing BOT_NAMES — run patch-check-for-actions.mjs first, then re-run this patch.",
    );
    return;
  }

  const bak = `${appPath}.bak-no-email-${Date.now()}`;
  fs.copyFileSync(appPath, bak);

  if (!/function\s+resolveTeamBotName\b/.test(src)) {
    src = src.replace(
      /const BOT_NAMES\s*=\s*new Set\([^;]*\);\s*/,
      (m) => `${m}\n${EMAIL_HELPERS}\n`,
    );
  }

  if (!/Never email team bots/.test(src)) {
    // Insert rewrite at start of applyAgentAction try block
    const tryAt = src.search(
      /(?:async\s+)?function\s+applyAgentAction\b[\s\S]{0,200}?try\s*\{/,
    );
    if (tryAt < 0) {
      console.warn("Could not find applyAgentAction try block");
      return;
    }
    const brace = src.indexOf("{", src.indexOf("try", tryAt));
    src = src.slice(0, brace + 1) + "\n" + EMAIL_REWRITE + src.slice(brace + 1);
  }

  const esbuild = loadEsbuild(appPath);
  const compiled = canCompile(esbuild, src);
  if (!compiled.ok) {
    console.error("App.jsx would not compile:", compiled.error);
    fs.copyFileSync(bak, appPath);
    process.exit(2);
  }

  fs.writeFileSync(appPath, src, "utf8");
  console.log("Patched App.jsx email→command_agent rewrite");
  console.log("Backup:", path.basename(bak));
}

injectRuleIntoGinaJs();
patchAppJsx();

console.log(`
Next:
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  cd ~/lyday-gina-backend
  git add gina-backend/GINA_TEAM_PROMPT_RULE.txt gina-backend/gina.js gina-backend/frontend/src/App.jsx
  git commit -m "Never email Maria/Michelle/Kelley/Ashton — use command_agent"
  git pull origin main --rebase
  git push origin main

Already-queued email action #242: after deploy, Check for actions will rewrite it to a Maria team command (not send email).
`);
