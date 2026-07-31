/**
 * Combined Board + Candidate File Save/Export routes — mount at /ats
 *
 *   POST /ats/job-save-export
 *   POST /ats/job-save-export.txt
 *   GET  /job-save  (via mountJobSavePage)
 *
 * No separate job-save-page.route.js — keeps Railway deploys from crashing
 * when that file is missing from git.
 */

import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Router } from "express";
import { saveBoardAndCandidateFile } from "../lib/job-save-export.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FALLBACK_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>Save Board + Candidate File</title></head>
<body style="font-family:sans-serif;max-width:640px;margin:40px auto;padding:0 16px">
<h1>Save Board + Candidate File</h1>
<p>Best after Michelle finishes screening. POST board candidates to
<code>/ats/job-save-export.txt</code> or use the ATS <strong>Save / Export</strong> button.</p>
<p><a href="/">Back to ATS</a></p>
</body></html>`;

function loadJobSaveHtml() {
  const candidates = [
    path.join(__dirname, "..", "frontend", "public", "job-save.html"),
    path.join(__dirname, "..", "frontend", "job-save.html"),
    path.join(process.cwd(), "frontend", "public", "job-save.html"),
    path.join(process.cwd(), "frontend", "job-save.html"),
    path.join(process.cwd(), "job-save.html"),
  ];
  for (const file of candidates) {
    try {
      if (existsSync(file)) return readFileSync(file, "utf8");
    } catch {
      // try next
    }
  }
  return FALLBACK_HTML;
}

export function createJobSaveExportRouter() {
  const router = Router();

  router.get("/job-save-export", (_req, res) => {
    res.json({
      ok: true,
      endpoint: "POST /ats/job-save-export",
      download: "POST /ats/job-save-export.txt",
      page: "/job-save",
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

/** HTML page — call once from server.js: mountJobSavePage(app) */
export function mountJobSavePage(app) {
  if (!app || typeof app.get !== "function") return;
  if (app.__jobSavePageMounted) return;
  const html = loadJobSaveHtml();
  const send = (_req, res) => {
    res.status(200).type("html").send(html);
  };
  app.get("/job-save", send);
  app.get("/job-save.html", send);
  app.__jobSavePageMounted = true;
  console.log("[job-save] page route: /job-save");
}

const router = createJobSaveExportRouter();
export default router;
