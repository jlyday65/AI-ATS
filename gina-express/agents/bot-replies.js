/**
 * Structured status replies for Maria / Michelle / Kelley / Ashton.
 * Used when Check for actions runs a command_agent (and for Maria sourcing).
 *
 * Communication contract:
 * - Every reply names the bot, echoes Kimberley's ask, states status, and names the next handoff.
 * - Queue acks are short; execute replies are the working update filed in Kimberley's Notes.
 */

function stamp() {
  return new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function bullets(lines) {
  return lines.filter(Boolean).map((l) => `• ${l}`).join("\n");
}

function extractQuotedNames(task = "") {
  const names = [];
  const re = /["']([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})["']/g;
  let m;
  while ((m = re.exec(task))) names.push(m[1]);
  const move = task.match(
    /\b(?:move|screen|advance|reject|email|follow[- ]?up(?:\s+with)?|contact)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
  );
  if (move?.[1] && !names.includes(move[1])) names.push(move[1]);
  return names.slice(0, 5);
}

function extractStageHint(task = "") {
  const m = String(task).match(
    /\b(new|screening|phone screen|interview|offer|hired|rejected|reject)\b/i,
  );
  if (!m) return "";
  const raw = m[1].toLowerCase();
  if (raw === "phone screen") return "Screening";
  if (raw === "reject") return "Rejected";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function extractRoleHint(task = "") {
  const m = String(task).match(
    /\b(?:for|screen(?:ing)?|source|sourcing|recruit(?:ing)?)\s+(?:the\s+|an?\s+)?([A-Z][A-Za-z0-9 /&-]{2,60}?)(?:\s+candidates?\b|\s+in\s+|\s+for\s+|$)/,
  );
  return m?.[1]?.trim() || "";
}

export function buildQueuedAck({ agentId, agentName, task } = {}) {
  const name = agentName || String(agentId || "Team");
  return [
    `${name} — queued (${stamp()})`,
    "",
    `Request: ${task || "(none)"}`,
    "",
    bullets([
      `Gina queued this for ${name}.`,
      "Run Agent → Check for actions to execute (Maria hits SignalHire; others file a working update here).",
      "Result reply will replace this ack in Kimberley's Notes for the same action.",
    ]),
  ].join("\n");
}

export function buildMariaReply({ task, result, error } = {}) {
  if (error) {
    return [
      `Maria — sourcing update (${stamp()})`,
      "",
      `Request: ${task || "Source candidates"}`,
      "",
      "Status: blocked",
      bullets([
        `SignalHire / Maria tool error: ${error}`,
        "Check RELAY_SECRET + SIGNALHIRE_BASE_URL on Gina, then re-run Check for actions.",
      ]),
      "",
      "Handoff: Kimberley → Gina once env is fixed; then Maria can push shortlists again.",
    ].join("\n");
  }

  const job = result?.job?.title || result?.result?.job?.title || "";
  const count =
    result?.candidateCount ??
    result?.result?.candidateCount ??
    result?.topCandidates?.length ??
    result?.result?.topCandidates?.length ??
    0;
  const names = (
    result?.topCandidates ||
    result?.result?.topCandidates ||
    []
  )
    .map((c) => c.name)
    .filter(Boolean)
    .slice(0, 5);
  const mode = result?.atsMode || result?.result?.atsMode || "";
  const pushed =
    result?.pushedCount ??
    result?.result?.pushedCount ??
    result?.importQueued ??
    null;

  return [
    `Maria — sourcing update (${stamp()})`,
    "",
    `Request: ${task || "Source candidates"}`,
    job ? `Role: ${job}` : null,
    mode ? `ATS mode: ${mode}` : null,
    `Shortlist ready: ${count} candidate(s)`,
    names.length ? `Top names: ${names.join(", ")}` : null,
    pushed != null ? `Pushed/queued to Gina board: ${pushed}` : null,
    "",
    "Handoff:",
    bullets([
      "Kimberley → Gina ATS → Agent → Check for actions to import any remaining candidates.",
      "Then ask Michelle to screen the new shortlist (same role).",
      "Kelley handles stage moves; Ashton drafts outreach after Kimberley approves.",
    ]),
  ]
    .filter((l) => l != null)
    .join("\n");
}

export function buildMichelleReply({ task, result } = {}) {
  const names = extractQuotedNames(task);
  const role = extractRoleHint(task) || result?.roleTitle || "";
  const reviewed =
    result?.reviewedCount ??
    result?.candidateCount ??
    (names.length || null);

  return [
    `Michelle — screening update (${stamp()})`,
    "",
    `Request: ${task}`,
    role ? `Role focus: ${role}` : null,
    names.length ? `Named candidates: ${names.join(", ")}` : null,
    "",
    "Status:",
    bullets([
      reviewed != null
        ? `Working a screen pass on ${reviewed} candidate(s) with resume text on file.`
        : "Reviewing candidates with resume text on file against the open requisition.",
      "Will flag strong fits for Screening / Interview and note gaps for Kimberley.",
      "No auto-reject without Kimberley approval on edge cases.",
    ]),
    "",
    "Handoff:",
    bullets([
      "Strong fits → Kelley for unambiguous stage moves.",
      "Gaps / edge cases → Kimberley's Notes until Kimberley decides.",
      "Approved outreach targets → Ashton for draft follow-ups.",
    ]),
  ]
    .filter((l) => l != null)
    .join("\n");
}

export function buildKelleyReply({ task, result } = {}) {
  const isBlog = /blog/i.test(String(task || ""));
  const names = extractQuotedNames(task);
  const stage = extractStageHint(task) || result?.stage || "";

  if (isBlog) {
    return [
      `Kelley — weekly blogs update (${stamp()})`,
      "",
      `Request: ${task}`,
      "",
      "Pipeline ops status:",
      bullets([
        "Weekly blog cadence is on the ops checklist for this week.",
        "Draft topics / owners will be confirmed against the content calendar.",
        "Any blockers (assets, approvals, publish slot) will be flagged to Kimberley same day.",
        "Target: status note before end of day with what's live, in draft, and due next.",
      ]),
      "",
      "Handoff: This update rolls into Gina's morning Pipeline Stage Counts briefing.",
    ].join("\n");
  }

  return [
    `Kelley — pipeline ops update (${stamp()})`,
    "",
    `Request: ${task}`,
    names.length ? `Candidates: ${names.join(", ")}` : null,
    stage ? `Requested stage: ${stage}` : null,
    "",
    "Status:",
    bullets([
      stage && names.length
        ? `Preparing to move ${names.join(", ")} → ${stage} when the board match is unambiguous.`
        : "Working the ATS pipeline: stages, notes, and housekeeping.",
      "Will move candidates only when the stage is unambiguous (New → Screening → Interview → Offer).",
      "Anything needing Kimberley's call will stay in Notes until approved.",
    ]),
    "",
    "Handoff:",
    bullets([
      "After stage moves, Michelle can re-screen if new resumes land.",
      "Ashton drafts outreach only for stages Kimberley has cleared.",
      "Follow-up lands in Kimberley's Note Panel and the morning briefing.",
    ]),
  ]
    .filter((l) => l != null)
    .join("\n");
}

export function buildAshtonReply({ task, result } = {}) {
  const isProject = /project status|status update|project/i.test(String(task || ""));
  const names = extractQuotedNames(task);
  const role = extractRoleHint(task) || result?.roleTitle || "";

  if (isProject) {
    return [
      `Ashton — project status update (${stamp()})`,
      "",
      `Request: ${task}`,
      "",
      "Outreach / project snapshot:",
      bullets([
        "Compiling current workstreams: active outreach, pending replies, and follow-ups due.",
        "Will separate: On track / At risk / Blocked with owners.",
        "Client-facing drafts stay in Approvals until Kimberley signs off.",
        "Full status brief will refresh Kimberley's Note Panel and the morning pipeline summary.",
      ]),
      "",
      "Handoff: Kimberley approves drafts → Ashton queues sends → Kelley keeps stages in sync.",
    ].join("\n");
  }

  return [
    `Ashton — outreach update (${stamp()})`,
    "",
    `Request: ${task}`,
    role ? `Role / list: ${role}` : null,
    names.length ? `Targets: ${names.join(", ")}` : null,
    "",
    "Status:",
    bullets([
      names.length
        ? `Drafting or queueing outreach / follow-ups for ${names.join(", ")}.`
        : "Drafting or queueing outreach / follow-ups tied to ATS records.",
      "Nothing sends externally without Kimberley approval when Approvals is enabled.",
      "Completed drafts appear here and feed Gina's briefing roll-up.",
    ]),
    "",
    "Handoff:",
    bullets([
      "Kimberley reviews drafts in Approvals / Notes.",
      "After send/approval, Kelley can advance stage (e.g. Screening → Interview).",
      "Michelle owns screen notes if a reply changes fit.",
    ]),
  ]
    .filter((l) => l != null)
    .join("\n");
}

export function buildBotReply({ agentId, task, result, error, phase } = {}) {
  const id = String(agentId || "").toLowerCase();
  if (phase === "queued") {
    const names = {
      maria: "Maria",
      michelle: "Michelle",
      kelley: "Kelley",
      kelly: "Kelley",
      ashton: "Ashton",
    };
    return buildQueuedAck({
      agentId: id,
      agentName: names[id] || "Team",
      task,
    });
  }
  if (id === "maria") return buildMariaReply({ task, result, error });
  if (id === "michelle") return buildMichelleReply({ task, result });
  if (id === "kelley" || id === "kelly") return buildKelleyReply({ task, result });
  if (id === "ashton") return buildAshtonReply({ task, result });
  return [
    `Team update (${stamp()})`,
    "",
    `Request: ${task || "(none)"}`,
    "Acknowledged — follow-up will appear in Kimberley's Note Panel.",
  ].join("\n");
}

export default buildBotReply;
