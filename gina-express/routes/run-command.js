/**
 * Gina Express route: execute a queued command_agent / Maria source action.
 *
 * Mount in server.js (after auth):
 *   import runCommandRouter from "./routes/run-command.js";
 *   app.use("/ats", runCommandRouter);
 */

import { Router } from "express";
import { commandAgent } from "../agents/command-agent.tool.js";
import { buildBotReply } from "../agents/bot-replies.js";
import { resolveAgent } from "../agents/registry.js";
import {
  kimberleyNotes,
  normalizeActionId,
} from "../lib/kimberley-notes.js";
import {
  extractLocationFromText,
  extractRoleTitleFromText,
  extractTargetAgentFromText,
  mariaSourceViaSignalHire,
} from "../maria-source.tool.js";

const router = Router();

const BOT_NAME_RE =
  /^(maria|michelle|kelley|kelly|ashton|gina|update|status)$/i;

function parsePayload(raw) {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return { task: raw };
    }
  }
  return raw;
}

/** Gather every string in the queued action so we can infer roleTitle. */
function collectText(value, out = [], depth = 0) {
  if (value == null || depth > 5) return out;
  if (typeof value === "string") {
    const t = value.trim();
    if (t) out.push(t);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, out, depth + 1);
    return out;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === "password" || k === "secret" || k === "token") continue;
      collectText(v, out, depth + 1);
    }
  }
  return out;
}

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

function normalizeSourcePayload(payload = {}, body = {}) {
  // Payload may itself be a JSON string, or nested under action.payload
  let flat = parsePayload(payload);
  if (flat && typeof flat.payload === "object") {
    flat = { ...flat, ...parsePayload(flat.payload) };
  }
  const actionRow = body.action || {};
  const actionPayload = parsePayload(actionRow.payload);
  flat = {
    ...parsePayload(actionPayload),
    ...flat,
  };

  const blob = collectText({
    ...flat,
    ...body,
    action: actionRow,
    summary: body.summary || flat.summary || actionRow.summary,
    detail: actionRow.detail || actionRow.notes || actionRow.description,
    taskHint: body.taskHint,
  }).join("\n");

  const primaryTask =
    flat.task ||
    flat.Task ||
    flat.instruction ||
    flat.message ||
    flat.description ||
    flat.roleDescription ||
    actionRow.task ||
    actionRow.summary ||
    "";

  // Gina often queues { role, location, requirements } with no task string
  const roleFromField = looksLikeJobTitle(flat.role) ? String(flat.role).trim() : "";
  const roleTitle = String(
    flat.roleTitle ||
      flat.role_title ||
      flat.context?.roleTitle ||
      roleFromField ||
      flat.job?.title ||
      flat.job?.name ||
      flat.requisition?.title ||
      extractRoleTitleFromText(primaryTask) ||
      extractRoleTitleFromText(blob) ||
      extractRoleTitleFromText(body.taskHint || "") ||
      flat.jobTitle ||
      flat.job_title ||
      (looksLikeJobTitle(flat.title) ? flat.title : "") ||
      "",
  ).trim();

  const location =
    flat.location ||
    flat.Location ||
    flat.context?.location ||
    extractLocationFromText(primaryTask) ||
    extractLocationFromText(blob) ||
    extractLocationFromText(body.taskHint || "") ||
    "";

  const resumesRequired = Boolean(
    flat.resumesRequired === true ||
      flat.context?.resumesRequired === true ||
      requirementsNeedResume(flat.requirements) ||
      /resume/i.test(primaryTask) ||
      /resume/i.test(blob),
  );

  let task = primaryTask || body.taskHint || flat.notes || flat.text || "";
  if (!String(task).trim() && roleTitle) {
    task = [
      `Source a ${roleTitle} candidate`,
      location ? `in ${location}` : "",
      resumesRequired ? "Resumes required." : "",
      Array.isArray(flat.requirements)
        ? flat.requirements.join("; ")
        : flat.requirements
          ? String(flat.requirements)
          : "",
    ]
      .filter(Boolean)
      .join(" ")
      .trim();
  }
  if (!String(task).trim()) task = blob;

  const targetAgent =
    flat.targetAgent ||
    flat.assignedTo ||
    flat.AssignedTo ||
    flat.agent ||
    flat.Agent ||
    flat.bot ||
    flat.to ||
    extractTargetAgentFromText(primaryTask) ||
    extractTargetAgentFromText(task) ||
    extractTargetAgentFromText(blob) ||
    extractTargetAgentFromText(body.taskHint || "") ||
    "";

  const roleDescription =
    flat.roleDescription ||
    flat.jobDescription ||
    flat.job_description ||
    flat.context?.roleDescription ||
    flat.context?.jobDescription ||
    flat.job?.description ||
    flat.selectedJob?.description ||
    flat.activeJob?.description ||
    (typeof flat.requirements === "string" ? flat.requirements : "") ||
    "";

  return {
    ...flat,
    task,
    roleTitle,
    location,
    targetAgent,
    jobId: flat.jobId || flat.context?.jobId || flat.job?.id || flat.selectedJob?.id,
    candidateFileId:
      flat.candidateFileId || flat.context?.candidateFileId || undefined,
    roleDescription: roleDescription || task,
    jobDescription: roleDescription || undefined,
    requiredSkills: flat.requiredSkills || flat.context?.requiredSkills,
    preferredSkills: flat.preferredSkills || flat.context?.preferredSkills,
    resumesRequired,
    _debugKeys: Object.keys(flat),
    _taskPreview: String(task || "").slice(0, 240),
  };
}

async function fileMariaNote({ task, roleTitle, result, actionId, requestedBy, error }) {
  const agent = resolveAgent("maria");
  const reply = buildBotReply({
    agentId: "maria",
    task: task || `Source ${roleTitle}`,
    result,
    error,
  });
  try {
    if (actionId && typeof kimberleyNotes.upsertByActionId === "function") {
      return await kimberleyNotes.upsertByActionId(actionId, {
        fromAgent: agent?.displayName || "Maria",
        agentRole: agent?.role || "Sourcer",
        task: task || `Source ${roleTitle}`,
        reply,
        actionId,
        requestedBy: requestedBy || "Kimberley",
        includeInBriefing: true,
      });
    }
    return await kimberleyNotes.insertNote({
      fromAgent: agent?.displayName || "Maria",
      agentRole: agent?.role || "Sourcer",
      task: task || `Source ${roleTitle}`,
      reply,
      actionId: actionId || null,
      requestedBy: requestedBy || "Kimberley",
      includeInBriefing: true,
    });
  } catch {
    return null;
  }
}

router.post("/run-command", async (req, res) => {
  try {
    const body = req.body || {};
    const type = String(body.type || body.actionType || "command_agent");
    const payload = normalizeSourcePayload(
      body.payload ?? body.action?.payload ?? body,
      body,
    );
    const actionId = normalizeActionId(
      body.actionId || body.action?.id || body.action?.actionId || null,
    ) || null;

    if (type === "source_candidates_signalhire") {
      if (!payload.roleTitle) {
        return res.status(400).json({
          ok: false,
          error:
            'Maria needs a roleTitle to source. Could not infer one from the queued action. Re-queue with roleTitle or task like "source a Warehouse Assistant Manager candidate in Atlanta".',
          debug: {
            keys: payload._debugKeys,
            taskPreview: payload._taskPreview || String(payload.task || "").slice(0, 240),
            hint:
              'Ask Gina again: "Ask Maria to source a <Job Title> candidate in <City>; resumes required"',
          },
        });
      }
      try {
        const result = await mariaSourceViaSignalHire(payload);
        const sourcedTitle =
          result?.job?.title || result?.result?.job?.title || payload.roleTitle;
        const note = await fileMariaNote({
          task: payload.task,
          roleTitle: sourcedTitle,
          result,
          actionId,
          requestedBy: payload.requestedBy,
        });
        return res.json({
          ok: true,
          summary: `Maria sourced via SignalHire for ${sourcedTitle} — filed in Kimberley's Notes`,
          kimberleyNoteId: note?.id || null,
          reply: note?.reply || null,
          roleTitle: sourcedTitle,
          roleDescription:
            result?.job?.description ||
            result?.roleDescription ||
            payload.roleDescription ||
            payload.jobDescription ||
            null,
          location:
            result?.job?.location || result?.location || payload.location || null,
          candidateCount:
            result?.candidateCount ??
            result?.topCandidates?.length ??
            null,
          headcount:
            result?.candidateCount ??
            result?.topCandidates?.length ??
            null,
          result,
        });
      } catch (err) {
        const note = await fileMariaNote({
          task: payload.task,
          roleTitle: payload.roleTitle,
          actionId,
          requestedBy: payload.requestedBy,
          error: String(err?.message || err),
        });
        return res.status(500).json({
          ok: false,
          error: String(err?.message || err),
          kimberleyNoteId: note?.id || null,
          reply: note?.reply || null,
        });
      }
    }

    if (type === "create_candidate_file") {
      const { createCandidateFileFromInstruction } = await import(
        "../agents/candidate-file.tool.js"
      );
      const result = await createCandidateFileFromInstruction({
        task: payload.task || payload.instruction || "",
        requestedBy: payload.requestedBy || "Kimberley",
        roleTitle: payload.roleTitle || payload.jobTitle || payload.role,
        jobDescription: payload.jobDescription || payload.description,
        salary: payload.salary,
        location: payload.location,
        clientName: payload.clientName || payload.client,
        sendToMaria: payload.sendToMaria,
        context: payload.context || {},
        queueAction: req.app?.locals?.queueAction,
      });
      return res.json({
        ok: result.ok !== false,
        summary: result.message,
        kimberleyNoteId: result.kimberleyNoteId || null,
        reply: result.reply || null,
        // Flatten for Check for actions → Jobs tab (maybeUpsertJobFromPayload).
        roleTitle: result.roleTitle || result.file?.job?.title || null,
        roleDescription:
          result.roleDescription || result.file?.job?.description || null,
        location: result.location || result.file?.job?.location || null,
        result,
      });
    }

    if (type === "command_agent") {
      const target = String(payload.targetAgent || "").trim();
      if (!target) {
        return res.status(400).json({
          ok: false,
          error:
            'command_agent requires targetAgent (maria | michelle | kelley | ashton). Refusing to default to Maria.',
          debug: {
            keys: payload._debugKeys,
            taskPreview: payload._taskPreview || String(payload.task || "").slice(0, 240),
            hint:
              'Queue with targetAgent/agent: "maria" (or michelle/kelley/ashton), plus task.',
          },
        });
      }
      const task = payload.task || "";
      if (!String(task).trim()) {
        return res.status(400).json({
          ok: false,
          error: "command_agent requires task (what the bot should do).",
          debug: {
            keys: payload._debugKeys,
            roleTitle: payload.roleTitle || null,
          },
        });
      }

      const result = await commandAgent({
        targetAgent: target,
        task,
        requestedBy: payload.requestedBy || "Kimberley",
        actionId,
        executeNow: true,
        context: {
          ...(payload.context || {}),
          jobId: payload.jobId || payload.context?.jobId,
          candidateFileId:
            payload.candidateFileId || payload.context?.candidateFileId,
          roleTitle: payload.roleTitle || payload.context?.roleTitle,
          location: payload.location || payload.context?.location,
          roleDescription:
            payload.roleDescription ||
            payload.jobDescription ||
            payload.context?.roleDescription ||
            payload.context?.jobDescription,
          jobDescription:
            payload.jobDescription ||
            payload.roleDescription ||
            payload.context?.jobDescription ||
            payload.context?.roleDescription,
          requiredSkills:
            payload.requiredSkills || payload.context?.requiredSkills,
          preferredSkills:
            payload.preferredSkills || payload.context?.preferredSkills,
          seniority: payload.seniority || payload.context?.seniority,
          resumesRequired: payload.resumesRequired,
        },
      });

      const mariaJob =
        result.mariaResult?.job || result.mariaResult?.result?.job || {};
      return res.json({
        ok: result.ok !== false,
        error:
          result.ok === false
            ? result.error || result.message || "Team command failed"
            : undefined,
        summary:
          result.message ||
          `${result.agent} update filed in Kimberley's Note Panel`,
        kimberleyNoteId: result.kimberleyNoteId || null,
        reply: result.reply || null,
        // Flatten Maria job fields so Gina Jobs tab can upsert without digging.
        roleTitle:
          result.mariaResult?.roleTitle ||
          mariaJob.title ||
          result.context?.roleTitle ||
          payload.roleTitle ||
          null,
        roleDescription:
          result.mariaResult?.roleDescription ||
          mariaJob.description ||
          payload.roleDescription ||
          payload.jobDescription ||
          payload.context?.roleDescription ||
          null,
        location:
          result.mariaResult?.location ||
          mariaJob.location ||
          payload.location ||
          null,
        candidateCount:
          result.mariaResult?.candidateCount ??
          result.mariaResult?.result?.candidateCount ??
          result.mariaResult?.topCandidates?.length ??
          null,
        headcount:
          result.mariaResult?.candidateCount ??
          result.mariaResult?.result?.candidateCount ??
          result.mariaResult?.topCandidates?.length ??
          null,
        result,
      });
    }

    return res.status(400).json({
      ok: false,
      error: `Unsupported command type "${type}"`,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: String(err?.message || err),
    });
  }
});

export default router;
