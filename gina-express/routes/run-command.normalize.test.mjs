#!/usr/bin/env node
/**
 * Simulate normalizeSourcePayload against live Gina queue shapes (actions 88/89/172).
 *   node gina-express/routes/run-command.normalize.test.mjs
 *
 * Mirrors routes/run-command.js helpers (kept local so we don't boot Express).
 */
import {
  extractLocationFromText,
  extractRoleTitleFromText,
  extractTargetAgentFromText,
} from "../maria-source.tool.js";

const BOT_NAME_RE =
  /^(maria|michelle|kelley|kelly|ashton|gina|update|status)$/i;

function looksLikeJobTitle(value) {
  const s = String(value || "").trim();
  if (!s || BOT_NAME_RE.test(s)) return false;
  return s.length >= 3 && s.length <= 80;
}

function requirementsNeedResume(requirements) {
  if (requirements == null) return false;
  if (Array.isArray(requirements)) {
    return requirements.some((r) => /resume/i.test(String(r)));
  }
  return /resume/i.test(String(requirements));
}

function normalize(flat) {
  const blob = JSON.stringify(flat);
  const roleFromField = looksLikeJobTitle(flat.role) ? String(flat.role).trim() : "";
  const roleTitle = String(
    flat.roleTitle ||
      roleFromField ||
      extractRoleTitleFromText(blob) ||
      "",
  ).trim();
  const location =
    flat.location ||
    extractLocationFromText(blob) ||
    "";
  const resumesRequired = Boolean(
    flat.resumesRequired === true ||
      requirementsNeedResume(flat.requirements) ||
      /resume/i.test(blob),
  );
  let task = flat.task || "";
  if (!task && roleTitle) {
    task = `Source a ${roleTitle} candidate${location ? ` in ${location}` : ""}${
      resumesRequired ? ". Resumes required." : ""
    }`;
  }
  const targetAgent =
    flat.targetAgent ||
    flat.agent ||
    extractTargetAgentFromText(blob) ||
    "";
  return { roleTitle, location, resumesRequired, task, targetAgent };
}

const cases = [
  {
    name: "action 89 shape",
    flat: {
      role: "Warehouse Assistant Manager",
      agent: "Maria",
      location: "Atlanta, Georgia",
      requirements: ["Must have a resume"],
    },
    want: {
      roleTitle: "Warehouse Assistant Manager",
      location: "Atlanta, Georgia",
      resumesRequired: true,
      targetAgent: "Maria",
    },
  },
  {
    name: "action 88 shape",
    flat: {
      role: "Warehouse Assistant Manager",
      location: "Atlanta, Georgia",
      requirements: "All candidates must have a resume on file.",
    },
    want: {
      roleTitle: "Warehouse Assistant Manager",
      location: "Atlanta, Georgia",
      resumesRequired: true,
    },
  },
  {
    name: "command_agent with agent only in JSON taskHint",
    flat: { task: 'Ask Maria for an update' },
    want: { targetAgent: "maria", task: "Ask Maria for an update" },
  },
];

let failed = 0;
for (const c of cases) {
  const got = normalize(c.flat);
  for (const [k, v] of Object.entries(c.want)) {
    const actual = got[k];
    const ok =
      typeof v === "string"
        ? String(actual).toLowerCase() === String(v).toLowerCase() ||
          String(actual) === v
        : actual === v;
    if (!ok) {
      failed += 1;
      console.error("FAIL", c.name, k, "got", actual, "want", v);
    }
  }
  if (!failed) console.log("ok", c.name, got.roleTitle || got.targetAgent);
}

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll normalize cases passed.");
