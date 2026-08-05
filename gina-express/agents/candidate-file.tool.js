/**
 * Gina tool: create / fill a Candidate File and hand off to Maria.
 *
 * Kimberley examples:
 *   "Gina fill out the candidate file and send to Maria."
 *   "Create a candidate file for Warehouse Mechanic in Atlanta, $28–$34/hr, … Send to Maria."
 */

async function loadCandidateFiles() {
  try {
    return await import("../lib/candidate-files.js");
  } catch {
    try {
      return await import("./candidate-files.js");
    } catch {
      return null;
    }
  }
}

async function loadKimberleyNotes() {
  try {
    return await import("../lib/kimberley-notes.js");
  } catch {
    try {
      return await import("./kimberley-notes.js");
    } catch {
      return null;
    }
  }
}

function stamp() {
  return new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function cleanRoleTitle(raw = "") {
  let s = String(raw || "")
    .replace(/^(?:an?\s+|the\s+)/i, "")
    .replace(/\s+/g, " ")
    .replace(/[?.!,;:]+$/g, "")
    .trim();
  if (!s || /^(the|a|an|candidate|file|open role|role|job|position|maria|michelle)$/i.test(s)) {
    return "";
  }
  if (s.length < 3 || s.length > 90) return "";
  return s;
}

function cleanLocation(raw = "") {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .replace(/[?.!,;:]+$/g, "")
    .trim();
}

/**
 * "Candidate File to Maria: An Auto Production Floor Supervisor in Detroit, MI manages…"
 * → title + location + remainder as JD body.
 */
function parseColonRoleBlob(text = "") {
  const m = String(text || "").match(
    /\bcandidate\s+file(?:\s+to\s+\w+)?\s*:\s*(?:an?\s+|the\s+)?([A-Z][A-Za-z0-9 /&-]{2,80}?)\s+in\s+([A-Za-z .]+(?:,\s*[A-Z]{2})?)\s+([\s\S]+)/i,
  );
  if (!m) return null;
  const title = cleanRoleTitle(m[1]);
  const location = cleanLocation(m[2]);
  const description = String(m[3] || "").trim();
  if (!title || description.length < 40) return null;
  return { title, location, description };
}

/** Pull structured fields from Kimberley's natural-language ask. */
export function parseCandidateFileInstruction(task = "", context = {}) {
  const text = String(task || "").trim();
  const colonBlob = parseColonRoleBlob(text);
  const clientName =
    context.clientName ||
    text.match(/\b(?:client|company)\s*[:\-]\s*([^\n,]+)/i)?.[1]?.trim() ||
    text.match(/\bfor\s+([A-Z][A-Za-z0-9 &.'-]{2,40})\s+(?:role|job|position)/i)?.[1]?.trim() ||
    "";

  let title =
    cleanRoleTitle(context.roleTitle || context.jobTitle || context.title || "") ||
    cleanRoleTitle(text.match(/\bjob title\s*[:\-]\s*([^\n]+)/i)?.[1] || "") ||
    cleanRoleTitle(colonBlob?.title || "") ||
    cleanRoleTitle(
      text.match(
        /\b(?:for|role|position|title)\s*[:\-]?\s*(?:an?\s+|the\s+)?([A-Z][A-Za-z0-9 /&-]{2,60}?)(?:\s+in\s+|\s+at\s+|,\s*\$|\s+salary|\s+candidate|\s*$)/,
      )?.[1] || "",
    ) ||
    cleanRoleTitle(
      text.match(
        /\bcandidate file\s+(?:for|on)\s+(?:an?\s+|the\s+)?([A-Za-z0-9 /&-]{2,60}?)(?:\s+in\s+|,\s*\$|\s+and\s+|$)/i,
      )?.[1] || "",
    ) ||
    cleanRoleTitle(
      text.match(
        /\b(?:an?\s+|the\s+)?([A-Z][A-Za-z0-9/&-]+(?:\s+[A-Z][A-Za-z0-9/&-]+){1,6})\s+in\s+[A-Z]/,
      )?.[1] || "",
    ) ||
    "";

  if (!title) {
    title = "Open role";
  }

  const location =
    cleanLocation(context.location || "") ||
    cleanLocation(colonBlob?.location || "") ||
    cleanLocation(text.match(/\blocation\s*[:\-]\s*([^\n]+)/i)?.[1] || "") ||
    cleanLocation(text.match(/\bin\s+([A-Za-z .]+(?:,\s*[A-Z]{2})?)/i)?.[1] || "") ||
    "";

  const salary =
    context.salary ||
    text.match(/\bsalary\s*[:\-]\s*([^\n]+)/i)?.[1]?.trim() ||
    text.match(/(\$[\d,]+(?:\s*[–\-]\s*\$?[\d,]+)?(?:\s*\/\s*hr)?)/i)?.[1]?.trim() ||
    "";

  let description =
    context.jobDescription ||
    context.description ||
    text.match(/\bjob description\s*[:\-]\s*([\s\S]+?)(?:\n\s*\n|send to maria|$)/i)?.[1]?.trim() ||
    (colonBlob?.description && colonBlob.description.length >= 40
      ? colonBlob.description
      : "") ||
    "";

  // Unlabeled JD after "ROLE in CITY, ST …" when colon blob missed but title+location known.
  if (!description || description.length < 40) {
    const unlabeled = text.match(
      new RegExp(
        `${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+in\\s+${location.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+([\\s\\S]+)`,
        "i",
      ),
    )?.[1]?.trim();
    if (unlabeled && unlabeled.length >= 40) description = unlabeled;
  }

  if (!description) {
    description = [
      `Role: ${title}`,
      location ? `Location: ${location}` : null,
      salary ? `Salary: ${salary}` : null,
      "",
      "Kimberley asked Gina to open this Candidate File for Maria's sourcing.",
      "Maria: add candidates + resume text here, then hand to Michelle for screening Q&A.",
      "",
      `Original ask: ${text}`,
    ]
      .filter((l) => l != null)
      .join("\n");
  }

  const sendToMaria =
    context.sendToMaria !== false &&
    /\bmaria\b|\bsource\b|\bsourcing\b|\bsend to maria\b|\bhand\s*off\b/i.test(text);

  return {
    clientName,
    job: { title, description, salary, location },
    sendToMaria,
    requestedBy: context.requestedBy || "Kimberley",
  };
}

export function buildGinaCandidateFileReply({ file, sendToMaria, task }) {
  return [
    `Gina — Candidate File (${stamp()})`,
    "",
    `Request: ${task || "Fill out the Candidate File"}`,
    "",
    "Status:",
    `• Candidate File created: ${file.id}`,
    `• Role: ${file.job?.title || "(untitled)"}`,
    file.job?.salary ? `• Salary: ${file.job.salary}` : null,
    file.clientName ? `• Client: ${file.clientName}` : null,
    `• Open: /candidate-file (select this file for manual edits)`,
    "",
    "Handoff:",
    sendToMaria
      ? "• Maria — source candidates with resumes on file; add them to this Candidate File."
      : "• Kimberley can edit the file manually at /candidate-file, or ask Gina to send it to Maria.",
    "• After Maria fills candidates → Michelle for screening questions/answers on the same file.",
    "• Export for client review when ready.",
  ]
    .filter((l) => l != null)
    .join("\n");
}

/**
 * Create Candidate File + Kimberley note (+ optional Maria queue).
 */
export async function createCandidateFileFromInstruction(input = {}) {
  const task = String(input.task || input.instruction || input.message || "").trim();
  if (!task && !input.job?.title && !input.roleTitle) {
    throw new Error("task or job title is required to create a Candidate File");
  }

  const parsed = parseCandidateFileInstruction(task, {
    ...input.context,
    ...input,
    roleTitle: input.roleTitle || input.jobTitle || input.context?.roleTitle,
    jobDescription: input.jobDescription || input.context?.jobDescription,
    salary: input.salary || input.context?.salary,
    location: input.location || input.context?.location,
    clientName: input.clientName || input.context?.clientName,
    sendToMaria: input.sendToMaria,
    requestedBy: input.requestedBy,
  });

  if (input.job) {
    parsed.job = { ...parsed.job, ...input.job };
  }

  const mod = await loadCandidateFiles();
  const store = mod?.candidateFiles || mod?.createCandidateFiles?.();
  if (!store?.createFile) {
    throw new Error("candidate-files store is not available on this server");
  }

  const file = await store.createFile({
    createdBy: "Gina",
    clientName: parsed.clientName,
    status: "sourcing",
    job: parsed.job,
  });

  const reply = buildGinaCandidateFileReply({
    file,
    sendToMaria: parsed.sendToMaria,
    task: task || `Create Candidate File for ${parsed.job.title}`,
  });

  let kimberleyNoteId = null;
  const notesMod = await loadKimberleyNotes();
  const notes = notesMod?.kimberleyNotes || notesMod?.default;
  if (notes?.insertNote) {
    try {
      const note = await notes.insertNote({
        fromAgent: "Gina",
        agentRole: "Orchestrator",
        task: task || `Candidate File for ${parsed.job.title}`,
        reply,
        actionId: `cf_${file.id}`,
        requestedBy: parsed.requestedBy || "Kimberley",
        includeInBriefing: true,
      });
      kimberleyNoteId = note?.id || null;
    } catch {
      // non-fatal
    }
  }

  let jobQueued = null;
  if (
    typeof input.queueAction === "function" &&
    parsed.job.title &&
    !/^open role$/i.test(parsed.job.title) &&
    String(parsed.job.description || "").trim().length >= 40
  ) {
    try {
      jobQueued = await input.queueAction("upsert_job", {
        roleTitle: parsed.job.title,
        title: parsed.job.title,
        location: parsed.job.location,
        roleDescription: parsed.job.description,
        jobDescription: parsed.job.description,
        salary: parsed.job.salary,
        source: "candidate_file",
        candidateFileId: file.id,
        queuedAt: new Date().toISOString(),
      });
    } catch {
      jobQueued = null;
    }
  }

  let mariaQueued = null;
  if (parsed.sendToMaria && typeof input.queueAction === "function") {
    try {
      mariaQueued = await input.queueAction("command_agent", {
        targetAgent: "maria",
        targetDisplayName: "Maria",
        targetRole: "Sourcer",
        route: "/maria",
        requestedBy: parsed.requestedBy || "Kimberley",
        roleTitle: parsed.job.title,
        location: parsed.job.location,
        roleDescription: parsed.job.description,
        jobDescription: parsed.job.description,
        task: `Source candidates for ${parsed.job.title}${parsed.job.location ? ` in ${parsed.job.location}` : ""}. All candidates must have a resume on file. Add each shortlisted candidate + resume text into Candidate File ${file.id} (${parsed.job.title}).`,
        context: {
          candidateFileId: file.id,
          roleTitle: parsed.job.title,
          location: parsed.job.location,
          roleDescription: parsed.job.description,
          jobDescription: parsed.job.description,
          resumesRequired: true,
        },
        queuedAt: new Date().toISOString(),
      });
    } catch {
      mariaQueued = null;
    }
  }

  return {
    ok: true,
    file,
    candidateFileId: file.id,
    // Flatten for Check for actions → Jobs tab upsert (maybeUpsertJobFromPayload).
    roleTitle: parsed.job.title,
    title: parsed.job.title,
    roleDescription: parsed.job.description,
    jobDescription: parsed.job.description,
    location: parsed.job.location,
    salary: parsed.job.salary,
    kimberleyNoteId,
    jobActionId: jobQueued || null,
    mariaActionId: mariaQueued || null,
    sendToMaria: parsed.sendToMaria,
    reply,
    message: parsed.sendToMaria
      ? `Candidate File ${file.id} created and handed to Maria. Open /candidate-file or Kimberley's Notes.`
      : `Candidate File ${file.id} created. Open /candidate-file for manual entry.`,
    nextStep: parsed.sendToMaria
      ? "Agent → Check for actions so Maria can source. Or open /candidate-file to enter candidates manually."
      : "Open /candidate-file to finish job details and add candidates, or ask Gina to send it to Maria.",
  };
}

export const createCandidateFileTool = {
  name: "create_candidate_file",
  description:
    'REQUIRED when Kimberley asks Gina to fill out / create / open a Candidate File (especially "fill out the candidate file and send to Maria"). Creates the Candidate File with job title, description, and salary when provided, files a Kimberley Note, and queues Maria to source into that file when asked to send to Maria. Manual edits remain at /candidate-file.',
  parameters: {
    type: "object",
    required: ["task"],
    properties: {
      task: {
        type: "string",
        description:
          "Kimberley's full ask, including any job title, description, salary, location, client",
      },
      requestedBy: { type: "string", description: 'Usually "Kimberley"' },
      clientName: { type: "string" },
      roleTitle: { type: "string" },
      jobDescription: { type: "string" },
      salary: { type: "string" },
      location: { type: "string" },
      sendToMaria: {
        type: "boolean",
        description: "Default true when the ask mentions Maria / sourcing",
      },
    },
  },
  handler: createCandidateFileFromInstruction,
};

export default createCandidateFileFromInstruction;
