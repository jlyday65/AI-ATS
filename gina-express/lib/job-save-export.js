/**
 * Combined Board + Candidate File Save/Export.
 *
 * Builds a downloadable packet Kimberley can save to an external drive,
 * archives a copy under .data/job-save-exports/, and optionally pushes
 * candidates into AI-ATS talent pool for Maria reuse on similar jobs.
 */

import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { candidateFiles, buildClientExport } from "./candidate-files.js";

const ARCHIVE_DIR = path.join(process.cwd(), ".data", "job-save-exports");

function now() {
  return new Date().toISOString();
}

function safeName(value = "") {
  return String(value || "job")
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 48);
}

function normalizeBoardCandidate(c = {}) {
  return {
    id: c.id || `board_${randomUUID().slice(0, 8)}`,
    name: String(c.name || c.fullName || "").trim(),
    email: String(c.email || "").trim(),
    phone: String(c.phone || "").trim(),
    role: String(c.role || c.headline || c.jobTitle || "").trim(),
    location: String(c.location || "").trim(),
    source: String(c.source || "Board").trim(),
    stage: String(c.stage || c.status || "new").trim(),
    resumeText: String(c.resumeText || c.resume || "").trim(),
    notes: String(c.notes || "").trim(),
  };
}

function buildBoardSection(jobTitle, boardCandidates = []) {
  const lines = [];
  lines.push("BOARD CANDIDATES");
  lines.push("=".repeat(40));
  lines.push(`Job: ${jobTitle || "(untitled)"}`);
  lines.push(`Count: ${boardCandidates.length}`);
  lines.push(`Exported: ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}`);
  lines.push("");

  if (!boardCandidates.length) {
    lines.push("(No board candidates included in this save.)");
    return lines.join("\n");
  }

  boardCandidates.forEach((c, idx) => {
    lines.push(`BOARD CANDIDATE ${idx + 1}: ${c.name}`);
    lines.push("-".repeat(40));
    if (c.role) lines.push(`Role / headline: ${c.role}`);
    if (c.email) lines.push(`Email: ${c.email}`);
    if (c.phone) lines.push(`Phone: ${c.phone}`);
    if (c.location) lines.push(`Location: ${c.location}`);
    if (c.source) lines.push(`Source: ${c.source}`);
    if (c.stage) lines.push(`Stage: ${c.stage}`);
    if (c.notes) {
      lines.push("Notes:");
      lines.push(c.notes);
    }
    lines.push("Resume:");
    lines.push(c.resumeText || "(resume not on file)");
    lines.push("");
  });
  return lines.join("\n");
}

function mergePeople(boardCandidates = [], fileCandidates = []) {
  const map = new Map();
  for (const c of [...boardCandidates, ...fileCandidates]) {
    const name = String(c.name || c.fullName || "").trim();
    if (!name) continue;
    const key = (c.email || name).toLowerCase();
    const prev = map.get(key) || {};
    map.set(key, {
      name,
      fullName: name,
      email: c.email || prev.email || "",
      phone: c.phone || prev.phone || "",
      role: c.role || c.headline || prev.role || "",
      headline: c.headline || c.role || prev.headline || "",
      location: c.location || prev.location || "",
      source: c.source || prev.source || "",
      stage: c.stage || prev.stage || "",
      resumeText: c.resumeText || c.resume || prev.resumeText || "",
      summary: c.summary || prev.summary || "",
      skills: c.skills || prev.skills || [],
    });
  }
  return [...map.values()];
}

async function findCandidateFile({ candidateFileId, jobTitle }) {
  if (candidateFileId) {
    return candidateFiles.getFile(candidateFileId);
  }
  if (!jobTitle) return null;
  const files = await candidateFiles.listFiles({ limit: 100 });
  const want = jobTitle.trim().toLowerCase();
  return (
    files.find((f) => String(f.job?.title || "").trim().toLowerCase() === want) ||
    null
  );
}

function resolveSignalHireBaseUrl() {
  const raw = (
    process.env.SIGNALHIRE_BASE_URL ||
    process.env.AI_ATS_BASE_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");
  if (!raw) return "";
  return raw.includes("://") ? raw : `https://${raw}`;
}

async function pushToTalentPool({
  jobTitle,
  jobDescription,
  location,
  clientName,
  candidates,
  label,
}) {
  const base = resolveSignalHireBaseUrl();
  const secret = (
    process.env.RELAY_SECRET ||
    process.env.GINA_RELAY_SECRET ||
    ""
  ).trim();
  if (!base || !secret || !candidates.length) {
    return {
      ok: false,
      skipped: true,
      reason: !base
        ? "SIGNALHIRE_BASE_URL unset"
        : !secret
          ? "RELAY_SECRET unset"
          : "no candidates",
    };
  }

  const url = `${base}/api/talent-pool/archive`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Relay-Secret": secret,
      },
      body: JSON.stringify({
        jobTitle,
        jobDescription,
        location,
        clientName,
        label: label || "job_save_export",
        candidates,
      }),
    });
    const text = await response.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: json.error || text.slice(0, 240),
        url,
      };
    }
    return { ok: true, url, ...json };
  } catch (err) {
    return {
      ok: false,
      error: err?.message || String(err),
      url,
    };
  }
}

/**
 * Save Board + Candidate File together.
 *
 * @param {object} input
 * @param {string} input.jobTitle
 * @param {string} [input.jobDescription]
 * @param {string} [input.location]
 * @param {string} [input.clientName]
 * @param {string} [input.candidateFileId]
 * @param {Array} [input.boardCandidates]
 * @param {boolean} [input.pushToTalentPool=true]
 * @param {boolean} [input.saveLocalArchive=true]
 */
export async function saveBoardAndCandidateFile(input = {}) {
  const jobTitle = String(input.jobTitle || input.roleTitle || "").trim();
  if (!jobTitle) throw new Error("jobTitle is required");

  const boardCandidates = (input.boardCandidates || [])
    .map(normalizeBoardCandidate)
    .filter((c) => c.name);

  const file = await findCandidateFile({
    candidateFileId: input.candidateFileId,
    jobTitle,
  });

  let candidateFileText = "";
  if (file) {
    const exported = await candidateFiles.exportForClient(file.id, {
      saveArchive: true,
      label: input.label || "Combined job save",
    });
    candidateFileText = exported?.text || buildClientExport(file);
  } else {
    candidateFileText = [
      "CANDIDATE FILE",
      "=".repeat(40),
      `(No Candidate File found for "${jobTitle}". Board section still saved.)`,
      "",
    ].join("\n");
  }

  const boardText = buildBoardSection(jobTitle, boardCandidates);
  const header = [
    "LYDAY TALENT — JOB SAVE / EXPORT",
    "=".repeat(40),
    `Job: ${jobTitle}`,
    input.clientName ? `Client: ${input.clientName}` : null,
    input.location ? `Location: ${input.location}` : null,
    `Saved at: ${now()}`,
    "Contents: Board candidates + Candidate File packet",
    "Use: download this .txt and Save As to your external drive.",
    "Maria reuse: people are also archived to SignalHire talent pool when configured.",
    "",
    "",
  ]
    .filter(Boolean)
    .join("\n");

  const text = `${header}${boardText}\n\n${"-".repeat(40)}\n\n${candidateFileText}\n`;

  let archivePath = null;
  if (input.saveLocalArchive !== false) {
    try {
      if (!existsSync(ARCHIVE_DIR)) mkdirSync(ARCHIVE_DIR, { recursive: true });
      const fname = `${safeName(jobTitle)}_${Date.now()}.txt`;
      const full = path.join(ARCHIVE_DIR, fname);
      writeFileSync(full, text, "utf8");
      archivePath = path.join(".data", "job-save-exports", fname);
    } catch {
      // ignore
    }
  }

  const people = mergePeople(boardCandidates, file?.candidates || []);
  let talentPool = { ok: false, skipped: true };
  if (input.pushToTalentPool !== false) {
    talentPool = await pushToTalentPool({
      jobTitle,
      jobDescription:
        input.jobDescription || file?.job?.description || "",
      location: input.location || file?.job?.location || "",
      clientName: input.clientName || file?.clientName || "",
      candidates: people,
      label: input.label || "job_save_export",
    });
  }

  return {
    ok: true,
    jobTitle,
    candidateFileId: file?.id || null,
    boardCount: boardCandidates.length,
    candidateFileCount: file?.candidates?.length || 0,
    peopleArchived: people.length,
    archivePath,
    talentPool,
    text,
    filename: `job-save-${safeName(jobTitle)}.txt`,
    whenToSave:
      "Best after Michelle finishes screening — export is a snapshot and does not clear the Board or stop Maria.",
  };
}

export default saveBoardAndCandidateFile;
