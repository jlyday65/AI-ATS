/**
 * Live Candidate File sync — bots keep the file current until Kimberley
 * sends it to the client or cancels/deletes it.
 *
 * Every bot write also dual-files Kimberley's Notes + pipeline Team updates
 * (includeInBriefing: true).
 */

import { candidateFiles as defaultFiles } from "./candidate-files.js";

export const LIVE_STATUSES = new Set([
  "draft",
  "sourcing",
  "screening",
  "ready",
  "live",
]);

export const CLOSED_STATUSES = new Set(["sent", "canceled", "cancelled", "deleted"]);

export function isLiveFile(file) {
  if (!file) return false;
  const status = String(file.status || "").toLowerCase();
  if (CLOSED_STATUSES.has(status)) return false;
  if (file.live === false) return false;
  return LIVE_STATUSES.has(status) || file.live === true || !status;
}

function stamp() {
  return new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function normName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function titleKey(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

async function loadNotes() {
  try {
    const mod = await import("./kimberley-notes.js");
    return mod.kimberleyNotes || mod.default || null;
  } catch {
    return null;
  }
}

/**
 * Resolve the live Candidate File for a bot event.
 * Prefer explicit id, else newest live file matching job title.
 */
export async function findLiveCandidateFile(
  {
    candidateFileId,
    jobTitle,
    roleTitle,
    jobId,
  } = {},
  store = defaultFiles,
) {
  if (!store?.getFile && !store?.listFiles) return null;

  if (candidateFileId && store.getFile) {
    const file = await store.getFile(candidateFileId);
    if (file && isLiveFile(file)) return file;
  }

  const title = titleKey(jobTitle || roleTitle || "");
  if (!title || !store.listFiles) return null;

  const rows = await store.listFiles({ limit: 100 });
  const live = (rows || []).filter(isLiveFile);
  const byTitle = live.filter((f) => titleKey(f.job?.title) === title);
  if (byTitle.length) {
    return byTitle.sort((a, b) =>
      String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
    )[0];
  }

  if (jobId) {
    const byJobId = live.find(
      (f) =>
        String(f.jobId || f.atsJobId || "") === String(jobId) ||
        String(f.ginaJobId || "") === String(jobId),
    );
    if (byJobId) return byJobId;
  }

  return null;
}

export function buildCandidateFileUpdateNote({
  file,
  fromAgent = "Gina",
  summary = "Candidate File updated",
  detail = "",
  changeType = "update",
} = {}) {
  const title = file?.job?.title || file?.id || "Candidate File";
  const lines = [
    `${fromAgent} — Candidate File update (${stamp()})`,
    "",
    `File: ${title} (${file?.id || "?"})`,
    `Status: ${file?.status || "live"} · live until sent / canceled`,
    `Change: ${changeType}`,
    `• ${summary}`,
  ];
  if (detail) {
    lines.push("");
    for (const line of String(detail).split("\n").filter(Boolean).slice(0, 24)) {
      lines.push(line.startsWith("•") ? line : `• ${line}`);
    }
  }
  lines.push("");
  lines.push(`Open anytime: /candidate-file?id=${file?.id || ""}`);
  lines.push("Kimberley: review / edit as needed — bots keep this file current.");
  return lines.join("\n");
}

/**
 * Dual-file: Kimberley's Notes + pipeline briefing Team updates.
 */
export async function notifyCandidateFileUpdate({
  file,
  fromAgent = "Gina",
  agentRole = "",
  summary,
  detail = "",
  changeType = "update",
  actionId = null,
  requestedBy = "Kimberley",
} = {}) {
  if (!file?.id) return null;
  const notes = await loadNotes();
  if (!notes?.insertNote) return null;

  const reply = buildCandidateFileUpdateNote({
    file,
    fromAgent,
    summary,
    detail,
    changeType,
  });

  try {
    const note = await notes.insertNote({
      fromAgent,
      agentRole: agentRole || fromAgent,
      task: `Candidate File update — ${file.job?.title || file.id}`,
      reply,
      actionId: actionId || `cf_upd_${file.id}_${Date.now().toString(36)}`,
      requestedBy,
      includeInBriefing: true,
    });
    return note;
  } catch {
    return null;
  }
}

function candidateMatch(existing, incoming) {
  const eName = normName(existing.name);
  const iName = normName(incoming.name);
  if (!eName || !iName) return false;
  if (eName === iName) return true;
  const eEmail = String(existing.email || "").trim().toLowerCase();
  const iEmail = String(incoming.email || "").trim().toLowerCase();
  if (eEmail && iEmail && eEmail === iEmail) return true;
  return false;
}

/**
 * Upsert Maria shortlist (and similar) into a live Candidate File.
 * Merges resumes / contact details; does not touch closed files.
 */
export async function upsertCandidatesIntoLiveFile(
  fileIdOrMeta,
  people = [],
  {
    store = defaultFiles,
    fromAgent = "Maria",
    agentRole = "Sourcer",
    notify = true,
    actionId = null,
    sourceDefault = "Maria",
  } = {},
) {
  const meta =
    typeof fileIdOrMeta === "string"
      ? { candidateFileId: fileIdOrMeta }
      : fileIdOrMeta || {};

  let file =
    (await findLiveCandidateFile(meta, store)) ||
    (meta.candidateFileId && store.getFile
      ? await store.getFile(meta.candidateFileId)
      : null);

  if (!file || !isLiveFile(file)) {
    return { ok: false, reason: "No live Candidate File", file: null, upserted: 0 };
  }
  if (!store.upsertCandidate && !store.addCandidate) {
    return { ok: false, reason: "Store missing upsert", file, upserted: 0 };
  }

  let upserted = 0;
  const names = [];
  for (const raw of people) {
    const name = String(raw?.name || raw?.fullName || "").trim();
    if (!name) continue;
    const incoming = {
      name,
      email: raw.email || "",
      phone: raw.phone || "",
      role: raw.role || raw.jobTitle || file.job?.title || "",
      source: raw.source || sourceDefault,
      resumeText:
        raw.resumeText || raw.resume_text || raw.summary || raw.headline || "",
      stage: raw.stage || "new",
      notes: raw.notes || "",
      headline: raw.headline || "",
      summary: raw.summary || "",
    };
    if (store.upsertCandidate) {
      file = await store.upsertCandidate(file.id, incoming);
    } else {
      const existing = (file.candidates || []).find((c) =>
        candidateMatch(c, incoming),
      );
      if (existing && store.updateCandidate) {
        file = await store.updateCandidate(file.id, existing.id, incoming);
      } else {
        file = await store.addCandidate(file.id, incoming);
      }
    }
    upserted += 1;
    names.push(name);
  }

  if (upserted && store.appendActivity) {
    file = await store.appendActivity(file.id, {
      fromAgent,
      type: "candidates_upserted",
      summary: `${fromAgent} added/updated ${upserted} candidate(s)`,
      names,
    });
  }

  let note = null;
  if (notify && upserted) {
    note = await notifyCandidateFileUpdate({
      file,
      fromAgent,
      agentRole,
      changeType: "candidates",
      summary: `${fromAgent} updated Candidate File with ${upserted} candidate(s)`,
      detail: names.map((n) => `• ${n}`).join("\n"),
      actionId,
    });
  }

  return { ok: true, file, upserted, names, note };
}

/**
 * Sync a Board / bot event onto the live Candidate File.
 */
export async function syncBotEventToCandidateFile(
  event = {},
  { store = defaultFiles, notify = true } = {},
) {
  const type = String(event.type || event.changeType || "").toLowerCase();
  const fromAgent = event.fromAgent || event.agent || "Gina";
  const agentRole = event.agentRole || "";
  const meta = {
    candidateFileId: event.candidateFileId || event.context?.candidateFileId,
    jobTitle:
      event.jobTitle ||
      event.roleTitle ||
      event.role ||
      event.candidate?.jobTitle ||
      event.candidate?.role ||
      "",
    jobId: event.jobId || event.candidate?.jobId,
  };

  let file = await findLiveCandidateFile(meta, store);
  if (!file || !isLiveFile(file)) {
    return { ok: false, reason: "No live Candidate File for this role", file: null };
  }

  let summary = "";
  let detail = "";
  let changeType = type || "update";

  if (
    type === "import_candidate" ||
    type === "create_candidate" ||
    type === "candidate_upsert"
  ) {
    const result = await upsertCandidatesIntoLiveFile(
      { candidateFileId: file.id },
      [event.candidate || event],
      {
        store,
        fromAgent,
        agentRole,
        notify: false,
        sourceDefault: fromAgent,
      },
    );
    file = result.file || file;
    summary = result.upserted
      ? `${fromAgent} added/updated ${event.candidate?.name || event.name || "candidate"} on the Candidate File`
      : "No candidate change";
    detail = event.candidate?.resumeText
      ? "Resume text on file"
      : "Contact / stage fields updated";
    changeType = "candidates";
  } else if (type === "update_stage" || type === "stage") {
    const name = event.candidate?.name || event.name || event.match?.name;
    const stage = event.stage || event.candidate?.stage;
    if (!name || !stage) {
      return { ok: false, reason: "Missing name/stage", file };
    }
    if (store.updateCandidateByName) {
      file = await store.updateCandidateByName(file.id, name, { stage });
    } else if (store.updateCandidate) {
      const hit = (file.candidates || []).find(
        (c) => normName(c.name) === normName(name),
      );
      if (hit) file = await store.updateCandidate(file.id, hit.id, { stage });
    }
    summary = `${fromAgent} moved ${name} → ${stage} on the Candidate File`;
    detail = `Stage: ${stage}`;
    changeType = "stage";
  } else if (type === "add_note" || type === "note") {
    const name = event.candidate?.name || event.name || event.match?.name;
    const text = event.text || event.note || "";
    if (!name || !text) {
      return { ok: false, reason: "Missing name/note", file };
    }
    if (store.appendCandidateNote) {
      file = await store.appendCandidateNote(file.id, name, text, fromAgent);
    }
    summary = `${fromAgent} added a note for ${name}`;
    detail = text.slice(0, 400);
    changeType = "note";
  } else if (type === "screening_questions" || type === "questions") {
    const questions = event.questions || [];
    if (store.setScreeningQuestions) {
      file = await store.setScreeningQuestions(file.id, questions);
    }
    summary = `${fromAgent} set ${questions.length} screening question(s)`;
    detail = questions
      .slice(0, 8)
      .map((q, i) => `${i + 1}. ${typeof q === "string" ? q : q.question}`)
      .join("\n");
    changeType = "screening";
  } else if (type === "screening_answers" || type === "answers") {
    const candidateId = event.candidateId;
    const answers = event.answers || [];
    if (candidateId && store.setCandidateAnswers) {
      file = await store.setCandidateAnswers(file.id, candidateId, answers);
    }
    summary = `${fromAgent} recorded screening answers`;
    changeType = "screening";
  } else {
    summary = event.summary || `${fromAgent} updated the Candidate File`;
    detail = event.detail || "";
  }

  if (store.appendActivity && summary) {
    file = await store.appendActivity(file.id, {
      fromAgent,
      type: changeType,
      summary,
    });
  }

  let note = null;
  if (notify && summary) {
    note = await notifyCandidateFileUpdate({
      file,
      fromAgent,
      agentRole,
      summary,
      detail,
      changeType,
      actionId: event.actionId,
    });
  }

  return { ok: true, file, summary, note, changeType };
}

export default {
  isLiveFile,
  findLiveCandidateFile,
  notifyCandidateFileUpdate,
  upsertCandidatesIntoLiveFile,
  syncBotEventToCandidateFile,
  LIVE_STATUSES,
  CLOSED_STATUSES,
};
