/**
 * Gina Express routes for Kimberley's Note Panel.
 *
 * Mount:
 *   import kimberleyNotesRouter from "./routes/kimberley-notes.js";
 *   app.use("/ats", kimberleyNotesRouter);
 *
 * Or pass pool:
 *   app.use("/ats", createKimberleyNotesRouter({ pool }));
 */

import { Router } from "express";
import {
  createKimberleyNotes,
  kimberleyNotes as defaultNotes,
} from "../lib/kimberley-notes.js";

export function createKimberleyNotesRouter(deps = {}) {
  const notes = deps.pool
    ? createKimberleyNotes({ pool: deps.pool })
    : deps.notes || defaultNotes;
  const router = Router();

  router.get("/kimberley-notes", async (req, res) => {
    try {
      const rows = await notes.listNotes({
        limit: req.query.limit,
        status: req.query.status,
        agent: req.query.agent,
        briefingOnly: req.query.briefing === "1" || req.query.briefing === "true",
      });
      res.json({ ok: true, notes: rows, count: rows.length });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err?.message || err) });
    }
  });

  /** Briefing helper — recent notes for pipeline summary (before :id routes). */
  router.get("/kimberley-notes/briefing", async (_req, res) => {
    try {
      const rows = await notes.listNotes({ limit: 20, briefingOnly: true });
      res.json({
        ok: true,
        teamUpdates: rows.map((n) => ({
          from: n.fromAgent,
          role: n.agentRole,
          task: n.task,
          reply: n.reply,
          at: n.createdAt,
        })),
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err?.message || err) });
    }
  });

  /** Collapse historical duplicates that share the same action_id. */
  router.post("/kimberley-notes/dedupe", async (_req, res) => {
    try {
      if (typeof notes.dedupeByActionId !== "function") {
        return res.status(501).json({ ok: false, error: "dedupe not available" });
      }
      const result = await notes.dedupeByActionId();
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err?.message || err) });
    }
  });

  router.post("/kimberley-notes", async (req, res) => {
    try {
      const body = req.body || {};
      const row = await notes.insertNote(body);
      res.status(201).json({ ok: true, note: row });
    } catch (err) {
      res.status(400).json({ ok: false, error: String(err?.message || err) });
    }
  });

  router.post("/kimberley-notes/:id/read", async (req, res) => {
    try {
      const row = await notes.markStatus(req.params.id, "read");
      if (!row) return res.status(404).json({ ok: false, error: "Not found" });
      res.json({ ok: true, note: row });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err?.message || err) });
    }
  });

  return router;
}

const router = createKimberleyNotesRouter();
export default router;
