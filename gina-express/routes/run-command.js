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
import { kimberleyNotes } from "../lib/kimberley-notes.js";
import {
  extractLocationFromText,
  extractRoleTitleFromText,
  mariaSourceViaSignalHire,
} from "../maria-source.tool.js";

const router = Router();

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

function normalizeSourcePayload(payload = {}, body = {}) {
  const flat = parsePayload(payload);
  const blob = collectText({
    ...flat,
    ...body,
    action: body.action,
    summary: body.summary || flat.summary,
    taskHint: body.taskHint,
  }).join("\n");

  const primaryTask =
    flat.task ||
    flat.Task ||
    flat.instruction ||
    flat.message ||
    flat.description ||
    flat.roleDescription ||
    "";
  const task = primaryTask || body.taskHint || flat.notes || flat.text || blob;

  const roleTitle =
    flat.roleTitle ||
    flat.role_title ||
    flat.context?.roleTitle ||
    extractRoleTitleFromText(primaryTask) ||
    extractRoleTitleFromText(task) ||
    flat.jobTitle ||
    flat.job_title ||
    flat.title ||
    "";

  const location =
    flat.location ||
    flat.Location ||
    flat.context?.location ||
    extractLocationFromText(task) ||
    extractLocationFromText(blob) ||
    "";

  return {
    ...flat,
    task,
    roleTitle,
    location,
    roleDescription: flat.roleDescription || task,
    resumesRequired:
      flat.resumesRequired ??
      flat.context?.resumesRequired ??
      (/resume/i.test(task) || /resume/i.test(blob)),
    _debugKeys: Object.keys(flat),
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
    const actionId = body.actionId || body.action?.id || null;

    if (type === "source_candidates_signalhire") {
      if (!payload.roleTitle) {
        return res.status(400).json({
          ok: false,
          error:
            'Maria needs a roleTitle to source. Could not infer one from the queued action. Re-queue with roleTitle or task like "source a Warehouse Assistant Manager candidate in Atlanta".',
          debug: {
            keys: payload._debugKeys,
            taskPreview: String(payload.task || "").slice(0, 240),
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
        roleTitle: payload.roleTitle || payload.jobTitle,
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
        result,
      });
    }

    if (type === "command_agent") {
      const target =
        payload.targetAgent ||
        payload.assignedTo ||
        payload.AssignedTo ||
        payload.agent ||
        payload.to ||
        "";
      if (!String(target).trim()) {
        return res.status(400).json({
          ok: false,
          error:
            'command_agent requires targetAgent (maria | michelle | kelley | ashton). Refusing to default to Maria.',
        });
      }
      const task = payload.task || "";
      if (!String(task).trim()) {
        return res.status(400).json({
          ok: false,
          error: "command_agent requires task (what the bot should do).",
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
          roleTitle: payload.roleTitle,
          location: payload.location,
          resumesRequired: payload.resumesRequired,
        },
      });

      return res.json({
        ok: result.ok !== false,
        summary:
          result.message ||
          `${result.agent} update filed in Kimberley's Note Panel`,
        kimberleyNoteId: result.kimberleyNoteId || null,
        reply: result.reply || null,
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
