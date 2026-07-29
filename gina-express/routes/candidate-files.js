/**
 * Candidate File routes — mount at /ats
 *
 *   import { createCandidateFilesRouter } from "./routes/candidate-files.js";
 *   app.use("/ats", createCandidateFilesRouter());
 */

import { Router } from "express";
import {
  createCandidateFiles,
  candidateFiles as defaultStore,
} from "../lib/candidate-files.js";

export function createCandidateFilesRouter(deps = {}) {
  const store = deps.store || defaultStore || createCandidateFiles();
  const router = Router();

  router.get("/candidate-files", async (req, res) => {
    try {
      const files = await store.listFiles({
        limit: req.query.limit,
        status: req.query.status,
      });
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
        res.json({ ok: true, file });
      } catch (err) {
        res.status(400).json({ ok: false, error: String(err?.message || err) });
      }
    },
  );

  /** Build client packet + archive for future reference. */
  router.post("/candidate-files/:id/export", async (req, res) => {
    try {
      const result = await store.exportForClient(req.params.id, {
        saveArchive: req.body?.saveArchive !== false,
        label: req.body?.label,
      });
      if (!result) return res.status(404).json({ ok: false, error: "Not found" });
      res.json({
        ok: true,
        ...result,
        handoff: "Kimberley / Client — Candidate File ready for review.",
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err?.message || err) });
    }
  });

  /** Download last (or fresh) export as text/plain. */
  router.get("/candidate-files/:id/export.txt", async (req, res) => {
    try {
      const result = await store.exportForClient(req.params.id, {
        saveArchive: true,
        label: "Download",
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
