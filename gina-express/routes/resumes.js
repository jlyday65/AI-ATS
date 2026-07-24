/**
 * Gina ATS — native resume upload
 *
 * Install deps in Gina:
 *   npm install multer pdf-parse
 *
 * Mount in server.js (after auth middleware):
 *   import resumesRouter from "./routes/resumes.js";
 *   app.use("/resumes", resumesRouter);
 *
 * Endpoints:
 *   POST /resumes/upload   multipart: file, jobId?, jobTitle?, name?, email?, resumeText?
 *   GET  /resumes/recent   last 25 resume intakes (from candidates with resume_text)
 */

import express from "express";
import multer from "multer";
import { pool } from "../db.js";
import { logAgentActivity } from "../lib/agentActivity.js";
import {
  extractFromPdfBuffer,
  extractFromResumeText,
} from "../lib/resumeExtract.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

async function upsertCandidate({
  name,
  email,
  phone,
  role,
  resumeText,
  jobTitle,
  jobId,
  source = "ats_upload",
}) {
  const normalizedEmail = (email || "").trim().toLowerCase() || null;
  let candidateId = null;
  let created = false;

  if (normalizedEmail) {
    const { rows: existing } = await pool.query(
      "SELECT id FROM candidates WHERE lower(email) = $1 LIMIT 1",
      [normalizedEmail],
    );
    if (existing[0]) {
      candidateId = existing[0].id;
      await pool.query(
        `UPDATE candidates
         SET name = COALESCE($2, name),
             phone = COALESCE($3, phone),
             role = COALESCE($4, role),
             resume_text = COALESCE($5, resume_text),
             job_title = COALESCE($6, job_title),
             job_id = COALESCE($7, job_id),
             source = COALESCE($8, source),
             updated_at = NOW()
         WHERE id = $1`,
        [candidateId, name, phone, role, resumeText, jobTitle, jobId, source],
      );
    }
  }

  if (!candidateId) {
    // Fallback if updated_at / job columns differ — adjust to your schema.
    const { rows } = await pool.query(
      `INSERT INTO candidates (name, email, phone, role, resume_text, source, job_title, job_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING id`,
      [name, normalizedEmail, phone, role, resumeText, source, jobTitle, jobId],
    );
    candidateId = rows[0].id;
    created = true;
  }

  return { candidateId, created };
}

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const jobId = req.body.jobId || null;
    const jobTitle = (req.body.jobTitle || req.body.roleTitle || "").trim() || null;
    const nameOverride = (req.body.name || req.body.candidateName || "").trim();
    const emailOverride = (req.body.email || req.body.candidateEmail || "").trim();
    const pasted = (req.body.resumeText || "").trim();

    let extracted;
    let fileName = "pasted-resume.txt";

    if (req.file?.buffer?.length) {
      fileName = req.file.originalname || "resume.pdf";
      const isPdf =
        fileName.toLowerCase().endsWith(".pdf") ||
        req.file.mimetype === "application/pdf";
      if (isPdf) {
        extracted = await extractFromPdfBuffer(req.file.buffer, fileName);
      } else {
        extracted = extractFromResumeText(req.file.buffer.toString("utf8"));
      }
    } else if (pasted) {
      extracted = extractFromResumeText(pasted);
    } else {
      return res.status(400).json({
        error: "Upload a PDF or paste resume text",
      });
    }

    const name = nameOverride || extracted.fullName;
    const email = emailOverride || extracted.email;
    const phone = extracted.phone;
    const role = jobTitle || "Applicant";

    const { candidateId, created } = await upsertCandidate({
      name,
      email,
      phone,
      role,
      resumeText: extracted.resumeText,
      jobTitle,
      jobId,
      source: "ats_upload",
    });

    await logAgentActivity({
      agentName: "ATS",
      action: created
        ? `Uploaded resume for new candidate ${name}`
        : `Updated resume for ${name}`,
      status: "ok",
      detail: `job=${jobTitle || jobId || "none"}; file=${fileName}; chars=${extracted.resumeText.length}`,
    }).catch(() => {});

    res.status(201).json({
      ok: true,
      created,
      candidateId,
      candidate: {
        id: candidateId,
        name,
        email,
        phone,
        skills: extracted.skills,
        experienceYears: extracted.experienceYears,
        resumeChars: extracted.resumeText.length,
      },
      job: { id: jobId, title: jobTitle },
      fileName,
      nextStep:
        "Open the candidate record to review resume text, then ask Maria to evaluate against the job.",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

router.get("/recent", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, phone, role, job_title, job_id, source,
              length(resume_text) AS resume_chars, created_at
       FROM candidates
       WHERE resume_text IS NOT NULL AND length(trim(resume_text)) > 0
       ORDER BY id DESC
       LIMIT 25`,
    );
    res.json({ candidates: rows });
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

export default router;
