/**
 * Gina orchestrator tool: command Maria / Michelle / Kelley / Ashton.
 *
 * Drop into Gina next to routes/maria.js (or lib/agents/).
 * Wire `commandAgentTool` into Gina's main chat tool list so when Kimberley says
 * "ask Maria to…" / "have Michelle…" / "tell Kelley…" / "get Ashton to…",
 * Gina queues a real command instead of refusing.
 *
 * Replies are always written to Kimberley's Note Panel (and briefing roll-up).
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

function looksLikeSourceTask(task = "") {
  return /\b(source|sourcing|find candidates|recruit|shortlist|pipeline of candidates)\b/i.test(
    task,
  );
}

async function persistKimberleyNote({
  agent,
  task,
  reply,
  actionId,
  requestedBy,
}) {
  const mod = await loadKimberleyNotes();
  const notes = mod?.kimberleyNotes || mod?.default;
  if (!notes?.insertNote) return null;
  try {
    return await notes.insertNote({
      fromAgent: agent.displayName,
      agentRole: agent.role,
      task,
      reply,
      actionId: actionId ?? null,
      requestedBy: requestedBy || "Kimberley",
      includeInBriefing: true,
    });
  } catch {
    return null;
  }
}

/**
 * Queue or run a command for a team bot.
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
  const payload = {
    targetAgent: agent.id,
    targetDisplayName: agent.displayName,
    targetRole: agent.role,
    route: agent.route,
    requestedBy,
    task,
    context: input.context || {},
    queuedAt: new Date().toISOString(),
  };

  // Prefer explicit queue into ats_actions when Gina provides queueAction.
  if (typeof input.queueAction === "function") {
    const id = await input.queueAction("command_agent", payload);
    let mariaResult = null;
    let reply;
    if (agent.id === "maria" && looksLikeSourceTask(task)) {
      mariaResult = await runMariaFromTask(task, input.context || {});
      reply = buildBotReply({ agentId: "maria", task, result: mariaResult });
    } else {
      reply = buildBotReply({ agentId: agent.id, task });
    }
    const note = await persistKimberleyNote({
      agent,
      task,
      reply,
      actionId: id,
      requestedBy,
    });
    return {
      ok: true,
      queued: true,
      actionId: id,
      agent: agent.displayName,
      role: agent.role,
      task,
      requestedBy,
      mariaResult,
      reply,
      kimberleyNoteId: note?.id || null,
      message: `Queued for ${agent.displayName}. Reply filed in Kimberley's Note Panel${note?.id ? ` (#${note.id})` : ""}.`,
      nextStep:
        "Open Kimberley's Notes (or Agent → Check for actions). Replies also roll into Gina's morning Pipeline Stage Counts briefing.",
    };
  }

  // No queue helper — execute what we can now.
  if (agent.id === "maria" && looksLikeSourceTask(task)) {
    const mariaResult = await runMariaFromTask(task, input.context || {});
    const reply = buildBotReply({ agentId: "maria", task, result: mariaResult });
    const note = await persistKimberleyNote({
      agent,
      task,
      reply,
      requestedBy,
    });
    return {
      ok: true,
      queued: false,
      executed: true,
      agent: agent.displayName,
      role: agent.role,
      task,
      requestedBy,
      mariaResult,
      reply,
      kimberleyNoteId: note?.id || null,
      message: `Maria sourced via SignalHire. Update filed in Kimberley's Note Panel.`,
      nextStep:
        "In Gina ATS → Agent → Check for actions to import the shortlist. Read Kimberley's Notes for Maria's status.",
    };
  }

  const reply = buildBotReply({ agentId: agent.id, task });
  const note = await persistKimberleyNote({
    agent,
    task,
    reply,
    requestedBy,
  });

  return {
    ok: true,
    queued: false,
    executed: true,
    agent: agent.displayName,
    role: agent.role,
    route: agent.route,
    task,
    requestedBy,
    capabilities: agent.capabilities,
    reply,
    kimberleyNoteId: note?.id || null,
    message: `${agent.displayName} responded. Filed in Kimberley's Note Panel${note?.id ? ` (#${note.id})` : ""}.`,
    nextStep:
      "Open Kimberley's Notes. This update is included in Gina's Pipeline Stage Counts morning briefing.",
    payload,
  };
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
    task.match(
      /\b(?:source|find|recruit|hire)\s+(?:an?\s+|a\s+)?(.+?)(?:\s+candidate|\s+in\s+|\s+for\s+|$)/i,
    )?.[1]?.trim() ||
    "Open role";
  const location =
    context.location ||
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
  });
}

export const commandAgentTool = {
  name: "command_agent",
  description:
    "REQUIRED when Kimberley (or any user) asks Gina to tell/ask/have/command Maria, Michelle, Kelley, or Ashton to do something. Routes the task to that bot, files the reply in Kimberley's Note Panel, and includes it in the morning pipeline briefing. For Maria sourcing tasks, triggers SignalHire sourcing. Never say you cannot command team bots.",
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
