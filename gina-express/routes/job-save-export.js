/**
 * Combined Board + Candidate File Save/Export routes — mount at /ats
 *
 *   POST /ats/job-save-export
 *   GET  /ats/job-save-export.txt?jobTitle=...
 */

import { Router } from "express";
import { saveBoardAndCandidateFile } from "../lib/job-save-export.js";

export function createJobSaveExportRouter() {
  const router = Router();

  router.get("/job-save-export", (_req, res) => {
    res.json({
      ok: true,
      endpoint: "POST /ats/job-save-export",
      download: "POST returns text; or use GET /ats/job-save-export.txt",
      body: {
        jobTitle: "Warehouse Mechanic",
        jobDescription: "optional",
        location: "Atlanta, GA",
        candidateFileId: "optional",
        boardCandidates: [
          {
            name: "Example Person",
            email: "ex@example.com",
            resumeText: "...",
            stage: "new",
          },
        ],
        pushToTalentPool: true,
      },
      stageHint:
        "Save after Michelle completes screening. Snapshot only — does not clear Board.",
    });
  });

  router.post("/job-save-export", async (req, res) => {
    try {
      const result = await saveBoardAndCandidateFile(req.body || {});
      const download = req.query.download === "1" || req.body?.download === true;
      if (download) {
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${result.filename}"`,
        );
        return res.type("text/plain").send(result.text);
      }
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ ok: false, error: String(err?.message || err) });
    }
  });

  /** Convenience download — board must be posted; without body only Candidate File. */
  router.post("/job-save-export.txt", async (req, res) => {
    try {
      const result = await saveBoardAndCandidateFile(req.body || {});
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${result.filename}"`,
      );
      res.type("text/plain").send(result.text);
    } catch (err) {
      res.status(400).type("text").send(String(err?.message || err));
    }
  });

  return router;
}

const router = createJobSaveExportRouter();
export default router;
