/**
 * Gina orchestrator tool: command Maria / Michelle / Kelley / Ashton.
 *
 * Drop into Gina next to routes/maria.js (or lib/agents/).
 * Wire `commandAgentTool` into Gina's main chat tool list so when Kimberley says
 * "ask Maria to…" / "have Michelle…" / "tell Kelley…" / "get Ashton to…",
 * Gina queues a real command instead of refusing.
 *
 * Maria sourcing still uses maria-source.tool.js when the task is a source request.
 */

import { listCommandableAgents, resolveAgent } from "./registry.js";

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

function looksLikeSourceTask(task = "") {
  return /\b(source|sourcing|find candidates|recruit|shortlist|pipeline of candidates)\b/i.test(
    task,
  );
}

function extractRoleTitle(task = "") {
  const m =
    task.match(
      /\b(?:source|find|recruit|hire)\s+(?:an?\s+|a\s+)?(.+?)(?:\s+candidate|\s+in\s+|\s+for\s+|$)/i,
    ) || task.match(/\bfor\s+(?:the\s+)?(.+?)(?:\s+role|\s+in\s+|$)/i);
  return (m?.[1] || "").trim().replace(/[?.!]+$/, "");
}

function extractLocation(task = "") {
  const m = task.match(/\bin\s+([A-Za-z .]+(?:,\s*[A-Z]{2})?)/i);
  return (m?.[1] || "").trim().replace(/[?.!]+$/, "");
}

/**
 * Queue or run a command for a team bot.
 *
 * @param {object} input
 * @param {string} input.targetAgent - maria | michelle | kelley | ashton
 * @param {string} input.task - natural language instruction
 * @param {string} [input.requestedBy=Kimberley]
 * @param {object} [input.context]
 * @param {Function} [input.queueAction] - optional (type, payload) => Promise<id>
 *   If provided, inserts into ats_actions. If omitted, runs Maria sourcing inline when applicable.
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
    // Maria source tasks can also fan out immediately to SignalHire.
    let mariaResult = null;
    if (agent.id === "maria" && looksLikeSourceTask(task)) {
      mariaResult = await runMariaFromTask(task, input.context || {});
    }
    return {
      ok: true,
      queued: true,
      actionId: id,
      agent: agent.displayName,
      role: agent.role,
      task,
      requestedBy,
      mariaResult,
      message: `Queued command for ${agent.displayName} (${agent.role}): ${task}`,
    };
  }

  // No queue helper — execute what we can now.
  if (agent.id === "maria" && looksLikeSourceTask(task)) {
    const mariaResult = await runMariaFromTask(task, input.context || {});
    return {
      ok: true,
      queued: false,
      executed: true,
      agent: agent.displayName,
      role: agent.role,
      task,
      requestedBy,
      mariaResult,
      message: `Commanded ${agent.displayName} to source via SignalHire.`,
      nextStep:
        "In Gina ATS → Agent → Check for actions to import the shortlist.",
    };
  }

  // Michelle / Kelley / Ashton: acknowledge with a structured handoff payload
  // (Gina can persist this via queueAction once wired).
  return {
    ok: true,
    queued: false,
    pendingWireUp: agent.id !== "maria",
    agent: agent.displayName,
    role: agent.role,
    route: agent.route,
    task,
    requestedBy,
    capabilities: agent.capabilities,
    message: `Prepared command for ${agent.displayName} (${agent.role}) at ${agent.route}. Wire queueAction or the ${agent.route} bot handler to execute fully.`,
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
    context.roleTitle || extractRoleTitle(task) || "Open role";
  const location = context.location || extractLocation(task) || "";
  const resumesRequired =
    context.resumesRequired === true || /resume/i.test(task);

  return mod.mariaSourceViaSignalHire({
    roleTitle,
    location,
    roleDescription: task,
    resumesRequired,
    pushToGina: true,
    pushTopN: context.pushTopN ?? 5,
    jobId: context.jobId,
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
    "REQUIRED when Kimberley (or any user) asks Gina to tell/ask/have/command Maria, Michelle, Kelley, or Ashton to do something. Routes the task to that bot. For Maria sourcing tasks, triggers SignalHire sourcing. Never say you cannot command team bots.",
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
        description: "Clear instruction for that agent",
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
