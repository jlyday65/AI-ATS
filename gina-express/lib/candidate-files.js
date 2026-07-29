/**
 * Candidate Files — Gina → Maria → Michelle → client review packet.
 *
 * Persist to `.data/candidate-files.json` (and optional archived exports).
 * Same dual-store style as Kimberley Notes (file-first; pool later).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

const FILE_STORE = path.join(process.cwd(), ".data", "candidate-files.json");
const ARCHIVE_DIR = path.join(process.cwd(), ".data", "candidate-file-archives");

function loadFile() {
  try {
    if (!existsSync(FILE_STORE)) return [];
    const raw = JSON.parse(readFileSync(FILE_STORE, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveFile(rows) {
  try {
    const dir = path.dirname(FILE_STORE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(FILE_STORE, JSON.stringify(rows, null, 2), "utf8");
  } catch {
    // process memory still holds rows
  }
}

let memory = loadFile();

function id(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

function now() {
  return new Date().toISOString();
}

function normalizeJob(job = {}) {
  return {
    title: String(job.title || "").trim(),
    description: String(job.description || "").trim(),
    salary: String(job.salary || job.salaryNotes || "").trim(),
    salaryMin: job.salaryMin ?? null,
    salaryMax: job.salaryMax ?? null,
    salaryCurrency: job.salaryCurrency || "USD",
    location: String(job.location || "").trim(),
    employmentType: String(job.employmentType || "").trim(),
  };
}

function normalizeScreeningItem(item = {}) {
  return {
    id: item.id || id("sq"),
    question: String(item.question || "").trim(),
    answer: item.answer != null ? String(item.answer).trim() : "",
    askedBy: item.askedBy || "Michelle",
    answeredAt: item.answeredAt || null,
  };
}

function normalizeCandidate(c = {}) {
  return {
    id: c.id || id("cand"),
    name: String(c.name || "").trim(),
    email: String(c.email || "").trim(),
    phone: String(c.phone || "").trim(),
    role: String(c.role || "").trim(),
    source: String(c.source || "Maria").trim(),
    resumeText: String(c.resumeText || c.resume || "").trim(),
    stage: String(c.stage || "new").trim(),
    notes: String(c.notes || "").trim(),
    screening: Array.isArray(c.screening)
      ? c.screening.map(normalizeScreeningItem).filter((s) => s.question)
      : [],
    addedAt: c.addedAt || now(),
    updatedAt: now(),
  };
}

function normalizeFile(row = {}) {
  return {
    id: row.id || id("cf"),
    status: row.status || "draft",
    createdBy: row.createdBy || "Gina",
    clientName: String(row.clientName || row.client || "").trim(),
    job: normalizeJob(row.job || {}),
    screeningQuestions: Array.isArray(row.screeningQuestions)
      ? row.screeningQuestions
          .map((q) =>
            typeof q === "string"
              ? { id: id("sq"), question: q.trim(), askedBy: "Michelle" }
              : normalizeScreeningItem(q),
          )
          .filter((q) => q.question)
      : [],
    candidates: Array.isArray(row.candidates)
      ? row.candidates.map(normalizeCandidate).filter((c) => c.name)
      : [],
    exportHistory: Array.isArray(row.exportHistory) ? row.exportHistory : [],
    lastExportText: row.lastExportText || "",
    lastExportedAt: row.lastExportedAt || null,
    kimberleyNoteIds: Array.isArray(row.kimberleyNoteIds)
      ? row.kimberleyNoteIds
      : [],
    createdAt: row.createdAt || now(),
    updatedAt: row.updatedAt || now(),
  };
}

/**
 * Client-facing packet — clear, printable, no internal ops noise.
 */
export function buildClientExport(file) {
  const f = normalizeFile(file);
  const salary =
    f.job.salary ||
    [f.job.salaryMin, f.job.salaryMax]
      .filter((n) => n != null && n !== "")
      .join(" – ") ||
    "(not provided)";

  const lines = [];
  lines.push("CANDIDATE FILE — CLIENT REVIEW");
  lines.push("=".repeat(40));
  lines.push(`Prepared: ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}`);
  lines.push(`Status: ${f.status}`);
  if (f.clientName) lines.push(`Client: ${f.clientName}`);
  lines.push("");
  lines.push("ROLE");
  lines.push("-".repeat(40));
  lines.push(`Job title: ${f.job.title || "(untitled)"}`);
  lines.push(`Salary: ${salary}${f.job.salaryCurrency ? ` (${f.job.salaryCurrency})` : ""}`);
  if (f.job.location) lines.push(`Location: ${f.job.location}`);
  if (f.job.employmentType) lines.push(`Type: ${f.job.employmentType}`);
  lines.push("");
  lines.push("Job description:");
  lines.push(f.job.description || "(not provided)");
  lines.push("");

  if (f.screeningQuestions.length) {
    lines.push("SCREENING QUESTIONS (role)");
    lines.push("-".repeat(40));
    f.screeningQuestions.forEach((q, i) => {
      lines.push(`${i + 1}. ${q.question}`);
    });
    lines.push("");
  }

  lines.push(`CANDIDATES (${f.candidates.length})`);
  lines.push("=".repeat(40));

  if (!f.candidates.length) {
    lines.push("(No candidates added yet — Maria will populate this section.)");
  }

  f.candidates.forEach((c, idx) => {
    lines.push("");
    lines.push(`CANDIDATE ${idx + 1}: ${c.name}`);
    lines.push("-".repeat(40));
    if (c.role) lines.push(`Role / headline: ${c.role}`);
    if (c.email) lines.push(`Email: ${c.email}`);
    if (c.phone) lines.push(`Phone: ${c.phone}`);
    if (c.source) lines.push(`Sourced by: ${c.source}`);
    if (c.stage) lines.push(`Current stage: ${c.stage}`);
    if (c.notes) {
      lines.push("");
      lines.push("Recruiter notes:");
      lines.push(c.notes);
    }
    lines.push("");
    lines.push("Resume:");
    lines.push(c.resumeText || "(resume not on file yet)");

    const qs =
      c.screening?.length > 0
        ? c.screening
        : f.screeningQuestions.map((q) => ({
            question: q.question,
            answer: "",
          }));
    if (qs.length) {
      lines.push("");
      lines.push("Screening Q&A:");
      qs.forEach((s, i) => {
        lines.push(`  Q${i + 1}: ${s.question}`);
        lines.push(`  A${i + 1}: ${s.answer || "(pending)"}`);
      });
    }
  });

  lines.push("");
  lines.push("=".repeat(40));
  lines.push(
    "Client action: mark candidates to bring in / advance, or note passes.",
  );
  lines.push("Lyday Talent Partners — Candidate File");
  return lines.join("\n");
}

export function createCandidateFiles(deps = {}) {
  void deps; // pool reserved for later

  async function listFiles({ limit = 50, status } = {}) {
    let rows = memory.map(normalizeFile);
    if (status) rows = rows.filter((r) => r.status === status);
    rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return rows.slice(0, Number(limit) || 50);
  }

  async function getFile(fileId) {
    return memory.map(normalizeFile).find((r) => String(r.id) === String(fileId)) || null;
  }

  async function createFile(input = {}) {
    const job = normalizeJob(input.job || input);
    if (!job.title) throw new Error("Candidate File requires job.title");
    const row = normalizeFile({
      id: id("cf"),
      status: input.status || "sourcing",
      createdBy: input.createdBy || "Gina",
      clientName: input.clientName || input.client || "",
      job,
      screeningQuestions: input.screeningQuestions || [],
      candidates: input.candidates || [],
      createdAt: now(),
      updatedAt: now(),
    });
    memory = [row, ...memory].slice(0, 200);
    saveFile(memory);
    return row;
  }

  async function updateFile(fileId, patch = {}) {
    const idx = memory.findIndex((r) => String(r.id) === String(fileId));
    if (idx < 0) return null;
    const cur = normalizeFile(memory[idx]);
    const next = normalizeFile({
      ...cur,
      ...patch,
      id: cur.id,
      job: patch.job ? { ...cur.job, ...normalizeJob(patch.job) } : cur.job,
      candidates: patch.candidates
        ? patch.candidates.map(normalizeCandidate)
        : cur.candidates,
      screeningQuestions: patch.screeningQuestions
        ? patch.screeningQuestions.map((q) =>
            typeof q === "string"
              ? { id: id("sq"), question: q, askedBy: "Michelle" }
              : normalizeScreeningItem(q),
          )
        : cur.screeningQuestions,
      createdAt: cur.createdAt,
      updatedAt: now(),
    });
    memory[idx] = next;
    saveFile(memory);
    return next;
  }

  async function addCandidate(fileId, candidate) {
    const cur = await getFile(fileId);
    if (!cur) return null;
    const added = normalizeCandidate(candidate);
    if (!added.name) throw new Error("candidate.name required");
    const candidates = [...cur.candidates, added];
    return updateFile(fileId, {
      candidates,
      status: cur.status === "draft" ? "sourcing" : cur.status,
    });
  }

  async function setScreeningQuestions(fileId, questions = []) {
    const cur = await getFile(fileId);
    if (!cur) return null;
    return updateFile(fileId, {
      screeningQuestions: questions,
      status:
        cur.status === "sourcing" || cur.status === "draft"
          ? "screening"
          : cur.status,
    });
  }

  async function setCandidateAnswers(fileId, candidateId, answers = []) {
    const cur = await getFile(fileId);
    if (!cur) return null;
    const candidates = cur.candidates.map((c) => {
      if (String(c.id) !== String(candidateId)) return c;
      const byQ = new Map(
        answers.map((a) => [
          String(a.question || a.id || "").trim().toLowerCase(),
          a,
        ]),
      );
      let screening = c.screening.length
        ? c.screening
        : cur.screeningQuestions.map((q) => ({
            id: q.id,
            question: q.question,
            answer: "",
            askedBy: "Michelle",
          }));
      screening = screening.map((s) => {
        const hit =
          byQ.get(String(s.question).toLowerCase()) ||
          byQ.get(String(s.id).toLowerCase());
        if (!hit) return s;
        return {
          ...s,
          answer: String(hit.answer || "").trim(),
          answeredAt: now(),
        };
      });
      // Also append brand-new Qs from answers
      for (const a of answers) {
        const q = String(a.question || "").trim();
        if (!q) continue;
        if (!screening.some((s) => s.question.toLowerCase() === q.toLowerCase())) {
          screening.push(
            normalizeScreeningItem({
              question: q,
              answer: a.answer,
              askedBy: a.askedBy || "Michelle",
              answeredAt: now(),
            }),
          );
        }
      }
      return { ...c, screening, updatedAt: now() };
    });
    return updateFile(fileId, { candidates, status: "screening" });
  }

  async function exportForClient(fileId, { saveArchive = true, label } = {}) {
    const cur = await getFile(fileId);
    if (!cur) return null;
    const text = buildClientExport(cur);
    const entry = {
      id: id("exp"),
      at: now(),
      label: label || `Client review — ${cur.job.title || cur.id}`,
      text,
    };

    if (saveArchive) {
      try {
        if (!existsSync(ARCHIVE_DIR)) mkdirSync(ARCHIVE_DIR, { recursive: true });
        const safe = String(cur.job.title || cur.id)
          .replace(/[^\w.-]+/g, "_")
          .slice(0, 40);
        const fname = `${cur.id}_${safe}_${Date.now()}.txt`;
        writeFileSync(path.join(ARCHIVE_DIR, fname), text, "utf8");
        entry.archivePath = path.join(".data", "candidate-file-archives", fname);
      } catch {
        // ignore archive write errors
      }
    }

    const next = await updateFile(fileId, {
      lastExportText: text,
      lastExportedAt: entry.at,
      exportHistory: [entry, ...(cur.exportHistory || [])].slice(0, 50),
      status: cur.status === "screening" || cur.status === "sourcing" ? "ready" : cur.status,
    });
    return { file: next, export: entry, text };
  }

  return {
    listFiles,
    getFile,
    createFile,
    updateFile,
    addCandidate,
    setScreeningQuestions,
    setCandidateAnswers,
    exportForClient,
    buildClientExport,
  };
}

export const candidateFiles = createCandidateFiles();
