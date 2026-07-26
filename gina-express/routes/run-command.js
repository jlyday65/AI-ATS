/**
 * Gina Express route: execute a queued command_agent / Maria source action.
 *
 * Mount in server.js (after auth):
 *   import runCommandRouter from "./routes/run-command.js";
 *   app.use("/ats", runCommandRouter);
 *
 * Frontend "Check for actions" should POST here for command types instead of
 * treating "Maria" as a candidate name.
 */

import { Router } from "express";
import { commandAgent } from "../agents/command-agent.tool.js";
import { mariaSourceViaSignalHire } from "../maria-source.tool.js";

const router = Router();

function parsePayload(raw) {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
}

router.post("/run-command", async (req, res) => {
  try {
    const body = req.body || {};
    const type = String(body.type || body.actionType || "command_agent");
    const payload = parsePayload(body.payload || body);

    if (type === "source_candidates_signalhire") {
      const result = await mariaSourceViaSignalHire(payload);
      return res.json({
        ok: true,
        summary: `Maria sourced via SignalHire for ${payload.roleTitle || "role"}`,
        result,
      });
    }

    if (type === "command_agent") {
      const target =
        payload.targetAgent ||
        payload.assignedTo ||
        payload.agent ||
        payload.to ||
        "maria";
      const task =
        payload.task ||
        payload.instruction ||
        payload.message ||
        payload.description ||
        "";

      const result = await commandAgent({
        targetAgent: target,
        task,
        requestedBy: payload.requestedBy || "Kimberley",
        context: {
          ...(payload.context || {}),
          roleTitle: payload.roleTitle || payload.context?.roleTitle,
          location: payload.location || payload.context?.location,
          resumesRequired:
            payload.resumesRequired ??
            payload.context?.resumesRequired ??
            /resume/i.test(task),
        },
      });

      return res.json({
        ok: true,
        summary: result.message || `Commanded ${result.agent}`,
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
