/**
 * Candidate File routes — mount at /ats
 *
 *   import { createCandidateFilesRouter } from "./routes/candidate-files.js";
 *   app.use("/ats", createCandidateFilesRouter());
 *
 * Live dossier: bots keep the file current until Kimberley sends / cancels / deletes.
 */

import { Router } from "express";
import {
  createCandidateFiles,
  candidateFiles as defaultStore,
} from "../lib/candidate-files.js";
import {
  syncBotEventToCandidateFile,
  upsertCandidatesIntoLiveFile,
  notifyCandidateFileUpdate,
  findLiveCandidateFile,
} from "../lib/candidate-file-live.js";

export function createCandidateFilesRouter(deps = {}) {
  const store = deps.store || defaultStore || createCandidateFiles();
  const router = Router();

  router.get("/candidate-files", async (req, res) => {
    try {
      const liveOnly =
        req.query.live === "1" ||
        req.query.live === "true" ||
        req.query.liveOnly === "1";
      const files = liveOnly
        ? await store.listLiveFiles({ limit: req.query.limit })
        : await store.listFiles({
            limit: req.query.limit,
            status: req.query.status,
          });
      res.json({ ok: true, files, count: files.length, liveOnly: Boolean(liveOnly) });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err?.message || err) });
    }
  });

  /** Dashboard: live Candidate Files only. */
  router.get("/candidate-files/live", async (req, res) => {
    try {
      const files = await store.listLiveFiles({ limit: req.query.limit || 40 });
      res.json({ ok: true, files, count: files.length });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err?.message || err) });
    }
  });

  router.post("/candidate-files", async (req, res) => {
    try {
      const body = req.body || {};
      const file = await store.createFile(body);
      res.status(201).json({
        ok: true,
        file,
        handoff: "Maria — Candidate File created. Source candidates into this file with resumes.",
      });
    } catch (err) {
      res.status(400).json({ ok: false, error: String(err?.message || err) });
    }
  });

  /**
   * Gina / Kimberley natural-language create:
   * POST /ats/candidate-files/from-instruction
   * body: { task, roleTitle?, jobDescription?, salary?, location?, clientName?, sendToMaria? }
   */
  router.post("/candidate-files/from-instruction", async (req, res) => {
    try {
      const { createCandidateFileFromInstruction } = await import(
        "../agents/candidate-file.tool.js"
      );
      const queueAction =
        typeof req.app?.locals?.queueAction === "function"
          ? req.app.locals.queueAction
          : undefined;
      const result = await createCandidateFileFromInstruction({
        ...(req.body || {}),
        queueAction,
      });
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ ok: false, error: String(err?.message || err) });
    }
  });

  /** Resolve live file by job title (dashboard / bots). */
  router.get("/candidate-files/resolve", async (req, res) => {
    try {
      const file = await findLiveCandidateFile(
        {
          candidateFileId: req.query.id || req.query.candidateFileId,
          jobTitle: req.query.jobTitle || req.query.title || req.query.role,
          jobId: req.query.jobId,
        },
        store,
      );
      if (!file) return res.status(404).json({ ok: false, error: "No live file" });
      res.json({ ok: true, file });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err?.message || err) });
    }
  });

  /**
   * Bot / Check-for-actions sync — Board events update the live Candidate File.
   * POST /ats/candidate-files/sync
   */
  router.post("/candidate-files/sync", async (req, res) => {
    try {
      const body = req.body || {};
      const result = await syncBotEventToCandidateFile(body, { store, notify: true });
      if (!result.ok) {
        return res.status(404).json({ ok: false, error: result.reason || "No live file" });
      }
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(400).json({ ok: false, error: String(err?.message || err) });
    }
  });

  /** Maria bulk upsert shortlist into live file (by id or job title). */
  router.post("/candidate-files/upsert-candidates", async (req, res) => {
    try {
      const body = req.body || {};
      const people = body.candidates || body.people || body.topCandidates || [];
      const result = await upsertCandidatesIntoLiveFile(
        {
          candidateFileId: body.candidateFileId || body.fileId,
          jobTitle: body.jobTitle || body.roleTitle,
          jobId: body.jobId,
        },
        Array.isArray(people) ? people : [],
        {
          store,
          fromAgent: body.fromAgent || "Maria",
          agentRole: body.agentRole || "Sourcer",
          notify: body.notify !== false,
          sourceDefault: body.source || "Maria",
        },
      );
      if (!result.ok) {
        return res.status(404).json({ ok: false, error: result.reason || "No live file" });
      }
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(400).json({ ok: false, error: String(err?.message || err) });
    }
  });

  router.get("/candidate-files/:id", async (req, res) => {
    try {
      const file = await store.getFile(req.params.id);
      if (!file) return res.status(404).json({ ok: false, error: "Not found" });
      res.json({ ok: true, file });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err?.message || err) });
    }
  });

  router.patch("/candidate-files/:id", async (req, res) => {
    try {
      const file = await store.updateFile(req.params.id, req.body || {});
      if (!file) return res.status(404).json({ ok: false, error: "Not found" });
      res.json({ ok: true, file });
    } catch (err) {
      res.status(400).json({ ok: false, error: String(err?.message || err) });
    }
  });

  /** Maria: add a candidate (+ resume text). */
  router.post("/candidate-files/:id/candidates", async (req, res) => {
    try {
      const file = await store.addCandidate(req.params.id, req.body || {});
      if (!file) return res.status(404).json({ ok: false, error: "Not found" });
      res.status(201).json({
        ok: true,
        file,
        handoff: "Michelle — candidates added. Create screening questions and capture answers on this file.",
      });
    } catch (err) {
      res.status(400).json({ ok: false, error: String(err?.message || err) });
    }
  });

  /** Michelle: set role-level screening questions. */
  router.post("/candidate-files/:id/screening-questions", async (req, res) => {
    try {
      const questions = req.body?.questions || req.body || [];
      const file = await store.setScreeningQuestions(
        req.params.id,
        Array.isArray(questions) ? questions : [],
      );
      if (!file) return res.status(404).json({ ok: false, error: "Not found" });
      await notifyCandidateFileUpdate({
        file,
        fromAgent: "Michelle",
        agentRole: "Screener",
        changeType: "screening",
        summary: `Michelle set ${(file.screeningQuestions || []).length} screening question(s)`,
        detail: (file.screeningQuestions || [])
          .slice(0, 8)
          .map((q, i) => `${i + 1}. ${q.question}`)
          .join("\n"),
      });
      res.json({ ok: true, file });
    } catch (err) {
      res.status(400).json({ ok: false, error: String(err?.message || err) });
    }
  });

  /** Michelle: answers for one candidate. */
  router.post(
    "/candidate-files/:id/candidates/:candidateId/answers",
    async (req, res) => {
      try {
        const answers = req.body?.answers || req.body || [];
        const file = await store.setCandidateAnswers(
          req.params.id,
          req.params.candidateId,
          Array.isArray(answers) ? answers : [],
        );
        if (!file) return res.status(404).json({ ok: false, error: "Not found" });
        await notifyCandidateFileUpdate({
          file,
          fromAgent: "Michelle",
          agentRole: "Screener",
          changeType: "screening",
          summary: `Michelle recorded screening answers on Candidate File`,
        });
        res.json({ ok: true, file });
      } catch (err) {
        res.status(400).json({ ok: false, error: String(err?.message || err) });
      }
    },
  );

  /** Preview / archive packet — file stays LIVE. */
  router.post("/candidate-files/:id/export", async (req, res) => {
    try {
      const result = await store.exportForClient(req.params.id, {
        saveArchive: req.body?.saveArchive !== false,
        label: req.body?.label,
        markSent: false,
      });
      if (!result) return res.status(404).json({ ok: false, error: "Not found" });
      await notifyCandidateFileUpdate({
        file: result.file,
        fromAgent: "Gina",
        agentRole: "Orchestrator",
        changeType: "export_preview",
        summary: "Candidate File export preview refreshed (still LIVE)",
      });
      res.json({
        ok: true,
        ...result,
        handoff: "Still LIVE — Kimberley can keep reviewing; use Send to client to freeze.",
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err?.message || err) });
    }
  });

  /** Freeze + archive — status becomes `sent` (no further bot writes). */
  router.post("/candidate-files/:id/send", async (req, res) => {
    try {
      const result = await store.sendToClient(req.params.id, {
        label: req.body?.label || "Sent to client",
      });
      if (!result) return res.status(404).json({ ok: false, error: "Not found" });
      await notifyCandidateFileUpdate({
        file: result.file,
        fromAgent: "Kimberley",
        agentRole: "Operator",
        changeType: "sent",
        summary: "Candidate File sent to client — no longer live",
      });
      res.json({
        ok: true,
        ...result,
        handoff: "Sent to client. File is frozen. Create a new Candidate File for further sourcing.",
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err?.message || err) });
    }
  });

  router.post("/candidate-files/:id/cancel", async (req, res) => {
    try {
      const file = await store.cancelFile(req.params.id, {
        reason: req.body?.reason || "",
      });
      if (!file) return res.status(404).json({ ok: false, error: "Not found" });
      await notifyCandidateFileUpdate({
        file,
        fromAgent: "Kimberley",
        agentRole: "Operator",
        changeType: "canceled",
        summary: req.body?.reason || "Candidate File canceled",
      });
      res.json({ ok: true, file });
    } catch (err) {
      res.status(400).json({ ok: false, error: String(err?.message || err) });
    }
  });

  router.delete("/candidate-files/:id", async (req, res) => {
    try {
      const hard = req.query.hard === "1" || req.body?.hard === true;
      const file = await store.deleteFile(req.params.id, { hard });
      if (!file) return res.status(404).json({ ok: false, error: "Not found" });
      if (!hard) {
        await notifyCandidateFileUpdate({
          file,
          fromAgent: "Kimberley",
          agentRole: "Operator",
          changeType: "deleted",
          summary: "Candidate File deleted",
        });
      }
      res.json({ ok: true, file });
    } catch (err) {
      res.status(400).json({ ok: false, error: String(err?.message || err) });
    }
  });

  /** Download last (or fresh) export as text/plain — stays live. */
  router.get("/candidate-files/:id/export.txt", async (req, res) => {
    try {
      const result = await store.exportForClient(req.params.id, {
        saveArchive: true,
        label: "Download",
        markSent: false,
      });
      if (!result) return res.status(404).type("text").send("Not found");
      const safe = String(result.file.job.title || result.file.id)
        .replace(/[^\w.-]+/g, "_")
        .slice(0, 40);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="candidate-file-${safe}.txt"`,
      );
      res.type("text/plain").send(result.text);
    } catch (err) {
      res.status(500).type("text").send(String(err?.message || err));
    }
  });

  return router;
}

const router = createCandidateFilesRouter();
export default router;
