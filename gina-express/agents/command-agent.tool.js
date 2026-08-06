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
import {
  extractJobContext,
  mergeJobContext,
  screeningQuestionsFromJob,
  skillsFromJobDescription,
} from "../lib/job-context.js";

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

async function loadCandidateFiles() {
  try {
    const mod = await import("../lib/candidate-files.js");
    return mod.candidateFiles || null;
  } catch {
    try {
      const mod = await import("./candidate-files.js");
      return mod.candidateFiles || null;
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
  // Covers: "full status update", "following up on Home Depot sourcing", "why no candidates"
  if (
    /\bstatus\s+update\b/i.test(t) ||
    /\bfull\s+status\b/i.test(t) ||
    /\bupdate\s+request\b/i.test(t) ||
    /\bfollowing\s+up\b/i.test(t) ||
    /\bprovide\s+(?:an?\s+|a\s+full\s+)?(?:status\s+)?update\b/i.test(t) ||
    /\brequesting\s+(?:an?\s+|a\s+full\s+)?(?:status\s+)?update\b/i.test(t) ||
    /\bask(?:ing)?\s+for\s+(?:an?\s+|a\s+full\s+)?(?:status\s+)?update\b/i.test(
      t,
    ) ||
    /\bupdate\s+on\b/i.test(t) ||
    /\bprogress\s+on\b/i.test(t) ||
    /\bwhy\s+no\s+candidates\b/i.test(t) ||
    /\bexpected\s+timeline\b/i.test(t) ||
    /\bzero\s+candidates\b/i.test(t) ||
    /\bcandidates\s+sourced,\s*shortlisted\b/i.test(t) ||
    /\bpending\s+review\b/i.test(t)
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
  let michelleResult = null;
  let error = null;
  let reply;
  const jobCtx = mergeJobContext(context || {}, extractJobContext(context || {}));

  if (agent.id === "maria" && looksLikeSourceTask(task)) {
    try {
      mariaResult = await runMariaFromTask(task, jobCtx);
      // Keep the live Candidate File current — Kimberley should not fill it.
      try {
        const { upsertCandidatesIntoLiveFile } = await import(
          "../lib/candidate-file-live.js"
        );
        const people =
          mariaResult?.topCandidates ||
          mariaResult?.result?.topCandidates ||
          mariaResult?.candidates ||
          [];
        if (Array.isArray(people) && people.length) {
          const sync = await upsertCandidatesIntoLiveFile(
            {
              candidateFileId: jobCtx.candidateFileId || context.candidateFileId,
              jobTitle:
                jobCtx.roleTitle ||
                mariaResult?.roleTitle ||
                mariaResult?.job?.title ||
                "",
            },
            people,
            {
              fromAgent: "Maria",
              agentRole: "Sourcer",
              notify: true,
              actionId: actionId || null,
              sourceDefault: "Maria / SignalHire",
            },
          );
          if (sync?.ok) {
            mariaResult = {
              ...mariaResult,
              candidateFileId: sync.file?.id || jobCtx.candidateFileId,
              candidateFileUpserted: sync.upserted,
            };
          }
        }
      } catch {
        // non-fatal — Board import still happens in Check for actions
      }
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
  } else if (agent.id === "michelle" && looksLikeScreenTask(task)) {
    try {
      michelleResult = await runMichelleScreen(task, jobCtx);
      reply = buildBotReply({
        agentId: "michelle",
        task,
        result: michelleResult,
      });
    } catch (err) {
      error = String(err?.message || err);
      reply = buildBotReply({
        agentId: "michelle",
        task,
        error,
        result: jobCtx,
      });
    }
  } else {
    reply = buildBotReply({ agentId: agent.id, task, result: jobCtx });
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
    michelleResult,
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

export function looksLikeScreenTask(task = "") {
  const t = String(task || "");
  // Pure status asks keep the canned update; everything else runs JD-based screening.
  if (
    /\b(update|status|progress|report|check[- ]?in)\b/i.test(t) &&
    !/\b(screen|screening|questions?|interview|evaluate)\b/i.test(t)
  ) {
    return false;
  }
  return true;
}

async function runMariaFromTask(task, context = {}) {
  const mod = await loadMariaSource();
  if (!mod?.mariaSourceViaSignalHire) {
    throw new Error(
      "maria-source.tool.js is not available next to command-agent.tool.js",
    );
  }
  const jobCtx = mergeJobContext(context, extractJobContext(context));
  const rawRoleTitle =
    jobCtx.roleTitle ||
    (typeof mod.extractRoleTitleFromText === "function"
      ? mod.extractRoleTitleFromText(task)
      : "") ||
    task.match(
      /\b(?:source|find|recruit|hire)\s+(?:candidates?\s+for\s+)?(?:an?\s+|a\s+)?(.+?)(?:\s+candidate|\s+in\s+|\s+for\s+|$)/i,
    )?.[1]?.trim() ||
    "";
  // Candidate File placeholder must not become Maria's search title.
  const roleTitle = /^open role$/i.test(String(rawRoleTitle || "").trim())
    ? (typeof mod.extractRoleTitleFromText === "function"
        ? mod.extractRoleTitleFromText(
            `${task}\n${jobCtx.roleDescription || jobCtx.jobDescription || ""}`,
          )
        : "") || ""
    : String(rawRoleTitle || "").trim();
  if (
    !roleTitle ||
    /^(candidates?|people|someone|talent|open role)$/i.test(roleTitle)
  ) {
    throw new Error(
      'Maria needs a roleTitle to source. Include it in the task, e.g. "source a Warehouse Assistant Manager candidate in Atlanta" — or select the job on the Jobs tab first.',
    );
  }
  const location =
    jobCtx.location ||
    (typeof mod.extractLocationFromText === "function"
      ? mod.extractLocationFromText(task)
      : "") ||
    task.match(/\bin\s+([A-Za-z .]+(?:,\s*[A-Z]{2})?)/i)?.[1]?.trim() ||
    "";
  const resumesRequired =
    jobCtx.resumesRequired === true ||
    context.resumesRequired === true ||
    /resume/i.test(task);

  // Prefer the Jobs-tab / Candidate File JD — never force Kimberley to re-paste it.
  const roleDescription =
    jobCtx.roleDescription ||
    jobCtx.jobDescription ||
    context.roleDescription ||
    context.jobDescription ||
    task;

  const fromJd = skillsFromJobDescription(roleDescription, 8);
  const requiredSkills = [
    ...(Array.isArray(jobCtx.requiredSkills) ? jobCtx.requiredSkills : []),
    ...(Array.isArray(context.requiredSkills) ? context.requiredSkills : []),
    ...fromJd,
  ].filter(Boolean);

  return mod.mariaSourceViaSignalHire({
    roleTitle,
    location,
    roleDescription,
    jobDescription: roleDescription,
    resumesRequired,
    pushToGina: true,
    pushTopN: jobCtx.pushTopN ?? context.pushTopN ?? 5,
    requiredSkills: requiredSkills.length ? [...new Set(requiredSkills)] : undefined,
    preferredSkills: jobCtx.preferredSkills || context.preferredSkills,
    seniority: jobCtx.seniority || context.seniority,
    candidateFileId: jobCtx.candidateFileId || context.candidateFileId,
    task,
  });
}

async function runMichelleScreen(task, context = {}) {
  const jobCtx = mergeJobContext(context, extractJobContext(context));
  const files = await loadCandidateFiles();
  let file = null;
  if (jobCtx.candidateFileId && files?.getFile) {
    file = await files.getFile(jobCtx.candidateFileId);
  }
  // Auto-resolve live Candidate File by role title when id missing
  if (!file && files) {
    try {
      const { findLiveCandidateFile, notifyCandidateFileUpdate } = await import(
        "../lib/candidate-file-live.js"
      );
      file = await findLiveCandidateFile(
        {
          jobTitle: jobCtx.roleTitle || extractRoleFromTask(task),
          jobId: jobCtx.jobId,
        },
        files,
      );
      void notifyCandidateFileUpdate;
    } catch {
      file = null;
    }
  }

  const roleTitle =
    jobCtx.roleTitle || file?.job?.title || extractRoleFromTask(task) || "";
  const location = jobCtx.location || file?.job?.location || "";
  const roleDescription =
    jobCtx.roleDescription ||
    jobCtx.jobDescription ||
    file?.job?.description ||
    "";

  if (!roleDescription && !roleTitle) {
    throw new Error(
      "Michelle needs the open job description. Select the job on the Jobs tab (or open the Candidate File) before asking her to screen — no need to paste the JD into chat.",
    );
  }

  const questions = screeningQuestionsFromJob({
    roleTitle,
    roleDescription,
    location,
  });

  let candidateFileId = jobCtx.candidateFileId || file?.id || null;
  if (candidateFileId && files?.setScreeningQuestions) {
    file = await files.setScreeningQuestions(
      candidateFileId,
      questions.map((q) => q.question),
    );
    try {
      const { notifyCandidateFileUpdate } = await import(
        "../lib/candidate-file-live.js"
      );
      await notifyCandidateFileUpdate({
        file,
        fromAgent: "Michelle",
        agentRole: "Screener",
        changeType: "screening",
        summary: `Michelle set ${questions.length} screening question(s) on the live Candidate File`,
        detail: questions
          .slice(0, 8)
          .map((q, i) => `${i + 1}. ${q.question}`)
          .join("\n"),
      });
    } catch {
      // non-fatal
    }
  }

  const candidateCount = Array.isArray(file?.candidates)
    ? file.candidates.filter((c) => (c.resumeText || c.resume_text || "").trim())
        .length
    : jobCtx.candidateCount || null;

  return {
    ok: true,
    roleTitle,
    location,
    jobDescriptionUsed: Boolean(roleDescription),
    jobDescriptionChars: roleDescription.length,
    screeningQuestions: questions.map((q) => q.question),
    screeningQuestionCount: questions.length,
    candidateFileId,
    candidateCount: candidateCount ?? undefined,
    reviewedCount: candidateCount ?? undefined,
    message: roleDescription
      ? `Built ${questions.length} screening questions from the Jobs/Candidate File description for ${roleTitle || "the open role"} and saved them on the live Candidate File.`
      : `Built ${questions.length} screening questions for ${roleTitle || "the open role"} (limited JD on file).`,
  };
}

function extractRoleFromTask(task = "") {
  return (
    String(task).match(
      /\b(?:screen|screening|review)\s+(?:the\s+)?(.+?)(?:\s+candidates?|\s+shortlist|\s+in\s+|$)/i,
    )?.[1]?.trim() || ""
  );
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
