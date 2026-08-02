/**
 * Gina orchestrator tool: command Maria / Michelle / Kelley / Ashton.
 *
 * Communication flow:
 *   Kimberley → Gina (/chat) → queue command_agent
 *   → Agent → Check for actions → POST /ats/run-command (executeNow)
 *   → Maria (SignalHire) or Michelle/Kelley/Ashton structured reply
 *   → Kimberley's Notes (+ morning Pipeline Stage Counts briefing)
 *
 * Queue path only queues (+ short ack note). Execute path does the work.
 * That prevents Maria/SignalHire from running twice.
 */

import { listCommandableAgents, resolveAgent } from "./registry.js";
import { buildBotReply } from "./bot-replies.js";

async function loadMariaSource() {
  try {
    return await import("../maria-source.tool.js");
  } catch {
    try {
      return await import("./maria-source.tool.js");
    } catch {
      return null;
    }
  }
}

async function loadKimberleyNotes() {
  try {
    return await import("../lib/kimberley-notes.js");
  } catch {
    try {
      return await import("./kimberley-notes.js");
    } catch {
      return null;
    }
  }
}

/**
 * True only when Maria should run SignalHire sourcing.
 * Status updates that mention a project named "… Sourcing" must NOT match.
 */
export function looksLikeSourceTask(task = "") {
  const t = String(task || "");
  if (!t.trim()) return false;

  // Explicit update / status asks win — even if the project name contains "Sourcing".
  if (
    /\b(status\s+update|update\s+request|requesting\s+an?\s+update|provide\s+(?:a\s+)?(?:status\s+)?update|full\s+status|ask(?:ing)?\s+for\s+an?\s+update)\b/i.test(
      t,
    ) ||
    /\bupdate\s+on\b/i.test(t) ||
    /\bprogress\s+on\b/i.test(t)
  ) {
    return false;
  }

  // Require a sourcing *verb* / clear recruit intent — not the noun "sourcing" alone.
  return /\b(source|find candidates|recruit|shortlist|pipeline of candidates)\b/i.test(
    t,
  );
}

async function persistKimberleyNote({
  agent,
  task,
  reply,
  actionId,
  requestedBy,
  replaceActionId = false,
}) {
  const mod = await loadKimberleyNotes();
  const notes = mod?.kimberleyNotes || mod?.default;
  if (!notes?.insertNote) return null;
  const normalizedId =
    typeof mod.normalizeActionId === "function"
      ? mod.normalizeActionId(actionId)
      : actionId?.id ?? actionId?.actionId ?? actionId ?? null;
  try {
    if (
      (replaceActionId || normalizedId) &&
      normalizedId &&
      typeof notes.upsertByActionId === "function"
    ) {
      return await notes.upsertByActionId(normalizedId, {
        fromAgent: agent.displayName,
        agentRole: agent.role,
        task,
        reply,
        actionId: normalizedId,
        requestedBy: requestedBy || "Kimberley",
        includeInBriefing: true,
      });
    }
    return await notes.insertNote({
      fromAgent: agent.displayName,
      agentRole: agent.role,
      task,
      reply,
      actionId: normalizedId || null,
      requestedBy: requestedBy || "Kimberley",
      includeInBriefing: true,
    });
  } catch {
    return null;
  }
}

async function executeAgentWork({ agent, task, requestedBy, context, actionId }) {
  let mariaResult = null;
  let error = null;
  let reply;

  if (agent.id === "maria" && looksLikeSourceTask(task)) {
    try {
      mariaResult = await runMariaFromTask(task, context || {});
      reply = buildBotReply({
        agentId: "maria",
        task,
        result: mariaResult,
      });
    } catch (err) {
      error = String(err?.message || err);
      reply = buildBotReply({
        agentId: "maria",
        task,
        error,
      });
    }
  } else {
    reply = buildBotReply({ agentId: agent.id, task, result: context || {} });
  }

  const note = await persistKimberleyNote({
    agent,
    task,
    reply,
    actionId,
    requestedBy,
    replaceActionId: Boolean(actionId),
  });

  return {
    ok: !error,
    queued: false,
    executed: true,
    agent: agent.displayName,
    role: agent.role,
    route: agent.route,
    task,
    requestedBy,
    capabilities: agent.capabilities,
    mariaResult,
    error,
    reply,
    kimberleyNoteId: note?.id || null,
    message: error
      ? `${agent.displayName} hit an error — filed in Kimberley's Notes (and flagged for pipeline Team updates).`
      : `${agent.displayName} responded. Filed to Kimberley's Notes${note?.id ? ` (#${note.id})` : ""} and Gina's pipeline summary Team updates.`,
    nextStep:
      "Open Kimberley's Notes for the full reply, then ask Gina for the pipeline summary — this update must appear under Team updates (Kimberley Notes).",
  };
}

/**
 * Queue or run a command for a team bot.
 *
 * - With queueAction and without executeNow: queue only + ack note (no Maria run).
 * - With executeNow / no queueAction: execute work + result note.
 */
export async function commandAgent(input = {}) {
  const agent = resolveAgent(input.targetAgent || input.agent || input.to);
  if (!agent || agent.id === "gina") {
    const names = listCommandableAgents()
      .map((a) => a.displayName)
      .join(", ");
    throw new Error(
      `Unknown target agent "${input.targetAgent || ""}". Commandable: ${names}.`,
    );
  }

  const task = String(input.task || input.instruction || input.message || "").trim();
  if (!task) throw new Error("task is required (what should the agent do?)");

  const requestedBy = String(input.requestedBy || input.from || "Kimberley").trim();
  const context = input.context || {};
  const payload = {
    targetAgent: agent.id,
    targetDisplayName: agent.displayName,
    targetRole: agent.role,
    route: agent.route,
    requestedBy,
    task,
    context,
    queuedAt: new Date().toISOString(),
  };

  const executeNow = input.executeNow === true || input.execute === true;

  // Queue-only path: do not run Maria / do not file a full working reply yet.
  if (typeof input.queueAction === "function" && !executeNow) {
    const queued = await input.queueAction("command_agent", payload);
    const id =
      queued && typeof queued === "object"
        ? queued.id ?? queued.actionId ?? queued.action_id
        : queued;
    const reply = buildBotReply({
      agentId: agent.id,
      task,
      phase: "queued",
    });
    const note = await persistKimberleyNote({
      agent,
      task,
      reply,
      actionId: id,
      requestedBy,
      replaceActionId: true,
    });
    return {
      ok: true,
      queued: true,
      executed: false,
      actionId: id,
      agent: agent.displayName,
      role: agent.role,
      task,
      requestedBy,
      reply,
      kimberleyNoteId: note?.id || null,
      message: `Queued for ${agent.displayName}. Ack filed in Kimberley's Notes — run Check for actions to execute.`,
      nextStep:
        "Open Agent → Check for actions. That executes the bot work and replaces the ack with a working update in Kimberley's Notes.",
      payload,
    };
  }

  return executeAgentWork({
    agent,
    task,
    requestedBy,
    context,
    actionId: input.actionId || null,
  });
}

async function runMariaFromTask(task, context = {}) {
  const mod = await loadMariaSource();
  if (!mod?.mariaSourceViaSignalHire) {
    throw new Error(
      "maria-source.tool.js is not available next to command-agent.tool.js",
    );
  }
  const roleTitle =
    context.roleTitle ||
    (typeof mod.extractRoleTitleFromText === "function"
      ? mod.extractRoleTitleFromText(task)
      : "") ||
    task.match(
      /\b(?:source|find|recruit|hire)\s+(?:candidates?\s+for\s+)?(?:an?\s+|a\s+)?(.+?)(?:\s+candidate|\s+in\s+|\s+for\s+|$)/i,
    )?.[1]?.trim() ||
    "";
  if (!roleTitle || /^(candidates?|people|someone|talent)$/i.test(roleTitle)) {
    throw new Error(
      'Maria needs a roleTitle to source. Include it in the task, e.g. "source a Warehouse Assistant Manager candidate in Atlanta".',
    );
  }
  const location =
    context.location ||
    (typeof mod.extractLocationFromText === "function"
      ? mod.extractLocationFromText(task)
      : "") ||
    task.match(/\bin\s+([A-Za-z .]+(?:,\s*[A-Z]{2})?)/i)?.[1]?.trim() ||
    "";
  const resumesRequired =
    context.resumesRequired === true || /resume/i.test(task);

  return mod.mariaSourceViaSignalHire({
    roleTitle,
    location,
    roleDescription: task,
    resumesRequired,
    pushToGina: true,
    pushTopN: context.pushTopN ?? 5,
    requiredSkills: context.requiredSkills,
    task,
  });
}

/**
 * Execute a previously queued command_agent row from ats_actions.
 */
export async function runQueuedCommandAgent(action) {
  const payload = action?.payload || action || {};
  return commandAgent({
    ...payload,
    targetAgent: payload.targetAgent,
    task: payload.task,
    requestedBy: payload.requestedBy,
    context: payload.context,
    actionId: action?.id || payload.actionId || null,
    executeNow: true,
    queueAction: undefined,
  });
}

export const commandAgentTool = {
  name: "command_agent",
  description:
    "REQUIRED when Kimberley (or any user) asks Gina to tell/ask/have/command Maria, Michelle, Kelley/Kelly, or Ashton to do something — including status updates (e.g. ask Kelly for an update). Queues the task for that bot; Check for actions executes it and files the reply in Kimberley's Note Panel (also rolls into the morning pipeline briefing). For Maria sourcing tasks, Check for actions triggers SignalHire. Never say you cannot command team bots. Never skip Kelley/Kelly update requests.",
  parameters: {
    type: "object",
    required: ["targetAgent", "task"],
    properties: {
      targetAgent: {
        type: "string",
        description: "maria | michelle | kelley | ashton (kelly → kelley)",
      },
      task: {
        type: "string",
        description: "Natural language instruction for that bot",
      },
      requestedBy: {
        type: "string",
        description: 'Usually "Kimberley"',
      },
      context: {
        type: "object",
        description: "Optional jobId, roleTitle, location, resumesRequired, etc.",
      },
    },
  },
  handler: commandAgent,
};

export default commandAgent;
