/**
 * Candidate Files — live working dossier until Kimberley sends or cancels.
 *
 * Bots (Maria / Michelle / Kelley / Ashton) keep the file current.
 * Kimberley views anytime (/candidate-file + dashboard) and edits only
 * when needed. Status stays live (sourcing / screening / ready) until
 * `sent`, `canceled`, or `deleted`.
 *
 * Persist to `.data/candidate-files.json` (and optional archived exports).
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
    score: item.score != null ? Number(item.score) || 0 : 0,
    askedBy: item.askedBy || "Michelle",
    answeredAt: item.answeredAt || null,
  };
}

function normalizeCandidate(c = {}) {
  const noteLog = Array.isArray(c.noteLog)
    ? c.noteLog
    : c.notes && typeof c.notes === "string" && c.notes.trim()
      ? [{ at: now(), from: c.source || "Team", text: String(c.notes).trim() }]
      : [];
  return {
    id: c.id || id("cand"),
    name: String(c.name || "").trim(),
    email: String(c.email || "").trim(),
    phone: String(c.phone || "").trim(),
    role: String(c.role || "").trim(),
    source: String(c.source || "Maria").trim(),
    resumeText: String(c.resumeText || c.resume || "").trim(),
    headline: String(c.headline || "").trim(),
    summary: String(c.summary || "").trim(),
    stage: String(c.stage || "new").trim(),
    notes: String(c.notes || "").trim(),
    noteLog,
    screening: Array.isArray(c.screening)
      ? c.screening.map(normalizeScreeningItem).filter((s) => s.question)
      : [],
    addedAt: c.addedAt || now(),
    updatedAt: c.updatedAt || now(),
  };
}

function normalizeActivity(a = {}) {
  return {
    id: a.id || id("act"),
    at: a.at || now(),
    fromAgent: String(a.fromAgent || a.from || "Gina").trim(),
    type: String(a.type || "update").trim(),
    summary: String(a.summary || "").trim(),
    names: Array.isArray(a.names) ? a.names : undefined,
  };
}

function normalizeFile(row = {}) {
  const status = String(row.status || "draft").toLowerCase();
  const closed = ["sent", "canceled", "cancelled", "deleted"].includes(status);
  return {
    id: row.id || id("cf"),
    status: row.status || "draft",
    live: row.live != null ? Boolean(row.live) : !closed,
    createdBy: row.createdBy || "Gina",
    clientName: String(row.clientName || row.client || "").trim(),
    job: normalizeJob(row.job || {}),
    jobId: row.jobId || row.ginaJobId || row.atsJobId || null,
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
    activityLog: Array.isArray(row.activityLog)
      ? row.activityLog.map(normalizeActivity).slice(0, 100)
      : [],
    exportHistory: Array.isArray(row.exportHistory) ? row.exportHistory : [],
    lastExportText: row.lastExportText || "",
    lastExportedAt: row.lastExportedAt || null,
    sentAt: row.sentAt || null,
    canceledAt: row.canceledAt || null,
    deletedAt: row.deletedAt || null,
    kimberleyNoteIds: Array.isArray(row.kimberleyNoteIds)
      ? row.kimberleyNoteIds
      : [],
    createdAt: row.createdAt || now(),
    updatedAt: row.updatedAt || now(),
  };
}

function samePerson(a, b) {
  const na = String(a?.name || "")
    .trim()
    .toLowerCase();
  const nb = String(b?.name || "")
    .trim()
    .toLowerCase();
  if (na && nb && na === nb) return true;
  const ea = String(a?.email || "")
    .trim()
    .toLowerCase();
  const eb = String(b?.email || "")
    .trim()
    .toLowerCase();
  return Boolean(ea && eb && ea === eb);
}

function assertLive(file) {
  if (!file) return false;
  const status = String(file.status || "").toLowerCase();
  if (["sent", "canceled", "cancelled", "deleted"].includes(status)) return false;
  if (file.live === false) return false;
  return true;
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
  lines.push(`Status: ${f.status}${f.live ? " (LIVE — updates until sent/canceled)" : ""}`);
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
    lines.push("(No candidates yet — Maria will populate this section automatically.)");
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
        if (s.score) lines.push(`  Score: ${s.score}/5`);
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

  async function listFiles({ limit = 50, status, liveOnly = false } = {}) {
    let rows = memory.map(normalizeFile);
    if (status) rows = rows.filter((r) => r.status === status);
    if (liveOnly) rows = rows.filter((r) => assertLive(r));
    rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return rows.slice(0, Number(limit) || 50);
  }

  async function listLiveFiles({ limit = 50 } = {}) {
    return listFiles({ limit, liveOnly: true });
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
      live: true,
      createdBy: input.createdBy || "Gina",
      clientName: input.clientName || input.client || "",
      job,
      jobId: input.jobId || input.ginaJobId || null,
      screeningQuestions: input.screeningQuestions || [],
      candidates: input.candidates || [],
      activityLog: [
        {
          fromAgent: input.createdBy || "Gina",
          type: "created",
          summary: `Candidate File created for ${job.title}`,
        },
      ],
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
    if (!assertLive(cur)) {
      throw new Error("Candidate File is closed (sent / canceled / deleted) — reopen or create a new file");
    }
    const added = normalizeCandidate(candidate);
    if (!added.name) throw new Error("candidate.name required");
    const candidates = [...cur.candidates, added];
    return updateFile(fileId, {
      candidates,
      status: cur.status === "draft" ? "sourcing" : cur.status,
      live: true,
    });
  }

  /** Merge by name/email — bots use this so re-runs don't duplicate. */
  async function upsertCandidate(fileId, candidate) {
    const cur = await getFile(fileId);
    if (!cur) return null;
    if (!assertLive(cur)) {
      throw new Error("Candidate File is closed (sent / canceled / deleted)");
    }
    const incoming = normalizeCandidate(candidate);
    if (!incoming.name) throw new Error("candidate.name required");
    const idx = cur.candidates.findIndex((c) => samePerson(c, incoming));
    let candidates;
    if (idx >= 0) {
      const prev = cur.candidates[idx];
      const merged = normalizeCandidate({
        ...prev,
        ...incoming,
        id: prev.id,
        addedAt: prev.addedAt,
        resumeText: incoming.resumeText || prev.resumeText,
        email: incoming.email || prev.email,
        phone: incoming.phone || prev.phone,
        headline: incoming.headline || prev.headline,
        summary: incoming.summary || prev.summary,
        stage: incoming.stage || prev.stage,
        notes: incoming.notes || prev.notes,
        noteLog: prev.noteLog,
        screening: incoming.screening?.length ? incoming.screening : prev.screening,
        source: incoming.source || prev.source,
      });
      candidates = cur.candidates.map((c, i) => (i === idx ? merged : c));
    } else {
      candidates = [...cur.candidates, incoming];
    }
    return updateFile(fileId, {
      candidates,
      status: cur.status === "draft" ? "sourcing" : cur.status,
      live: true,
    });
  }

  async function updateCandidate(fileId, candidateId, patch = {}) {
    const cur = await getFile(fileId);
    if (!cur) return null;
    if (!assertLive(cur)) {
      throw new Error("Candidate File is closed (sent / canceled / deleted)");
    }
    const candidates = cur.candidates.map((c) => {
      if (String(c.id) !== String(candidateId)) return c;
      return normalizeCandidate({
        ...c,
        ...patch,
        id: c.id,
        addedAt: c.addedAt,
        screening: patch.screening || c.screening,
        noteLog: patch.noteLog || c.noteLog,
        updatedAt: now(),
      });
    });
    return updateFile(fileId, { candidates, live: true });
  }

  async function updateCandidateByName(fileId, name, patch = {}) {
    const cur = await getFile(fileId);
    if (!cur) return null;
    const hit = cur.candidates.find(
      (c) =>
        String(c.name || "")
          .trim()
          .toLowerCase() ===
        String(name || "")
          .trim()
          .toLowerCase(),
    );
    if (!hit) return cur;
    return updateCandidate(fileId, hit.id, patch);
  }

  async function appendCandidateNote(fileId, name, text, fromAgent = "Team") {
    const cur = await getFile(fileId);
    if (!cur) return null;
    if (!assertLive(cur)) {
      throw new Error("Candidate File is closed (sent / canceled / deleted)");
    }
    const hit = cur.candidates.find(
      (c) =>
        String(c.name || "")
          .trim()
          .toLowerCase() ===
        String(name || "")
          .trim()
          .toLowerCase(),
    );
    if (!hit) return cur;
    const entry = {
      at: now(),
      from: fromAgent,
      text: String(text || "").trim(),
    };
    if (!entry.text) return cur;
    const noteLog = [...(hit.noteLog || []), entry].slice(-40);
    const notes = [hit.notes, `${fromAgent}: ${entry.text}`]
      .filter(Boolean)
      .join("\n");
    return updateCandidate(fileId, hit.id, { noteLog, notes });
  }

  async function appendActivity(fileId, activity = {}) {
    const cur = await getFile(fileId);
    if (!cur) return null;
    const activityLog = [
      normalizeActivity(activity),
      ...(cur.activityLog || []),
    ].slice(0, 100);
    return updateFile(fileId, { activityLog, live: assertLive(cur) });
  }

  async function setScreeningQuestions(fileId, questions = []) {
    const cur = await getFile(fileId);
    if (!cur) return null;
    if (!assertLive(cur)) {
      throw new Error("Candidate File is closed (sent / canceled / deleted)");
    }
    return updateFile(fileId, {
      screeningQuestions: questions,
      status:
        cur.status === "sourcing" || cur.status === "draft"
          ? "screening"
          : cur.status,
      live: true,
    });
  }

  async function setCandidateAnswers(fileId, candidateId, answers = []) {
    const cur = await getFile(fileId);
    if (!cur) return null;
    if (!assertLive(cur)) {
      throw new Error("Candidate File is closed (sent / canceled / deleted)");
    }
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
          score: hit.score != null ? Number(hit.score) || 0 : s.score || 0,
          answeredAt: now(),
        };
      });
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
    return updateFile(fileId, { candidates, status: "screening", live: true });
  }

  /**
   * Build client packet archive. File stays LIVE unless markSent=true.
   * Kimberley uses sendToClient to freeze the dossier for the client.
   */
  async function exportForClient(fileId, { saveArchive = true, label, markSent = false } = {}) {
    const cur = await getFile(fileId);
    if (!cur) return null;
    if (String(cur.status).toLowerCase() === "deleted") {
      throw new Error("Candidate File was deleted");
    }
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

    const patch = {
      lastExportText: text,
      lastExportedAt: entry.at,
      exportHistory: [entry, ...(cur.exportHistory || [])].slice(0, 50),
    };
    if (markSent) {
      patch.status = "sent";
      patch.live = false;
      patch.sentAt = entry.at;
    } else if (assertLive(cur)) {
      // Preview / download — stay live for further bot updates
      patch.status = "ready";
      patch.live = true;
    }
    const next = await updateFile(fileId, patch);
    return { file: next, export: entry, text };
  }

  async function sendToClient(fileId, opts = {}) {
    return exportForClient(fileId, { ...opts, markSent: true, saveArchive: true });
  }

  async function cancelFile(fileId, { reason = "" } = {}) {
    const cur = await getFile(fileId);
    if (!cur) return null;
    return updateFile(fileId, {
      status: "canceled",
      live: false,
      canceledAt: now(),
      activityLog: [
        normalizeActivity({
          fromAgent: "Kimberley",
          type: "canceled",
          summary: reason || "Candidate File canceled",
        }),
        ...(cur.activityLog || []),
      ].slice(0, 100),
    });
  }

  async function deleteFile(fileId, { hard = false } = {}) {
    const idx = memory.findIndex((r) => String(r.id) === String(fileId));
    if (idx < 0) return null;
    if (hard) {
      const [removed] = memory.splice(idx, 1);
      saveFile(memory);
      return normalizeFile({ ...removed, status: "deleted", live: false, deletedAt: now() });
    }
    return updateFile(fileId, {
      status: "deleted",
      live: false,
      deletedAt: now(),
    });
  }

  return {
    listFiles,
    listLiveFiles,
    getFile,
    createFile,
    updateFile,
    addCandidate,
    upsertCandidate,
    updateCandidate,
    updateCandidateByName,
    appendCandidateNote,
    appendActivity,
    setScreeningQuestions,
    setCandidateAnswers,
    exportForClient,
    sendToClient,
    cancelFile,
    deleteFile,
    buildClientExport,
    isLive: assertLive,
  };
}

export const candidateFiles = createCandidateFiles();
