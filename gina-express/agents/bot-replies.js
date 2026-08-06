/**
 * Structured status replies for Maria / Michelle / Kelley / Ashton.
 * Used when Check for actions runs a command_agent (and for Maria sourcing).
 *
 * Communication contract:
 * - Every reply names the bot, echoes Kimberley's ask, states status, and names the next handoff.
 * - Queue acks are short; execute replies are the working update filed in Kimberley's Notes.
 * - Every executed bot reply is dual-filed:
 *     1) Kimberley's Notes (full text)
 *     2) Gina pipeline summary → Team updates (Kimberley Notes)
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

/** Dual-file destinations — every bot update must hit both. */
function filedToBothBlock() {
  return [
    "Filed to:",
    bullets([
      "Kimberley's Notes (full update)",
      "Gina's Pipeline Stage Counts summary → Team updates (Kimberley Notes)",
    ]),
  ].join("\n");
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
    /\b(new|screening|phone screen|interview(?:ing)?|offer|hired|rejected|reject)\b/i,
  );
  if (!m) return "";
  const raw = m[1].toLowerCase();
  if (raw === "phone screen" || raw === "screening") return "screening";
  if (raw === "reject" || raw === "rejected") return "rejected";
  if (raw === "interviewing" || raw === "interview") return "interview";
  if (raw === "hired" || raw === "offer" || raw === "new") return raw;
  return raw;
}

function stageLabel(key = "") {
  const k = String(key || "").toLowerCase();
  const map = {
    new: "New",
    screening: "Screening",
    interview: "Interview",
    offer: "Offer",
    hired: "Hired",
    rejected: "Rejected",
  };
  return map[k] || (k ? k.charAt(0).toUpperCase() + k.slice(1) : "");
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
      "Run Check for actions to execute (Maria hits SignalHire; others file a working update here).",
      "Result reply replaces this ack in Kimberley's Notes for the same action.",
      "Executed reply also rolls into Gina's pipeline summary → Team updates.",
    ]),
  ].join("\n");
}

function looksLikeMariaStatusAsk(task = "") {
  return (
    /\bstatus\s+update\b/i.test(task) ||
    /\bupdate\s+(request|on)\b/i.test(task) ||
    /\bfollowing\s+up\b/i.test(task) ||
    /\bprovide\s+(?:an?\s+)?update\b/i.test(task) ||
    /\bwhy\s+no\s+candidates\b/i.test(task) ||
    /\bexpected\s+timeline\b/i.test(task) ||
    /\bzero\s+candidates\b/i.test(task) ||
    /\bpending\s+review\b/i.test(task) ||
    /\bcandidates\s+sourced\b/i.test(task) ||
    /\bshortlisted\b/i.test(task)
  );
}

export function buildMariaReply({ task, result, error } = {}) {
  const statusAsk = looksLikeMariaStatusAsk(task || "");
  const homeDepot = /\bhome\s*depot\b/i.test(task || "");

  // Status / project update — do not pretend a shortlist exists on the Board.
  if (!error && statusAsk) {
    return [
      `Maria — status update (${stamp()})`,
      "",
      `Request: ${task || "Status update"}`,
      "",
      "Status: zero on Board — no completed Home Depot source job yet",
      bullets([
        "Why empty: Kimberley/Gina asked for Home Depot *updates*, not a completed Maria → SignalHire source with a job title + location that finished Check for actions.",
        "Earlier Home Depot asks were status/email routes (sometimes blocked needing roleTitle). Those never import Board cards.",
        "The July 30 Gina chat table (New: 64) was invented summary copy — not a live Board shortlist. Trust the ATS Board count (0).",
        "Timeline: as soon as Kimberley queues an explicit source ask and Check for actions succeeds with AI-ATS reachable (npm run dev + ngrok; Railway SIGNALHIRE_BASE_URL set). Typical shortlist is ~5–20 per run, not 64 from a status ping.",
        homeDepot
          ? 'Say to Gina: "Ask Maria to source 20 Warehouse Assistant Manager candidates in Atlanta, GA for Home Depot. All must have a resume on file." Then Check for actions.'
          : 'Say to Gina: "Ask Maria to source [ROLE] in [LOCATION]. Resumes required." Then Check for actions.',
      ]),
      "",
      filedToBothBlock(),
      "",
      "Handoff: Kimberley → Gina with an explicit source ask (role + location), not another status follow-up.",
    ].join("\n");
  }

  if (error) {
    const roleTitleMiss = /roleTitle/i.test(String(error || ""));
    if (statusAsk && roleTitleMiss) {
      return [
        `Maria — status update (${stamp()})`,
        "",
        `Request: ${task || "Status update"}`,
        "",
        "Status: needs clearer ask",
        bullets([
          "This looked like a status update, but Gina routed it as a source job.",
          "Re-ask: \"Ask Maria for an update on Home Depot sourcing\" (do not say email Maria).",
          "After the Gina patch that treats status updates as non-sourcing, Check for actions will file a real status reply here.",
          "That still will not put 64 people on the Board — sourcing requires an explicit role title + Check for actions import.",
        ]),
        "",
        filedToBothBlock(),
        "",
        "Handoff: Kimberley → Gina with a status ask (not send_email / not source).",
      ].join("\n");
    }
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
      filedToBothBlock(),
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
    filedToBothBlock(),
    "",
    "Handoff:",
    bullets([
      "Kimberley → Gina ATS → Check for actions to import any remaining candidates.",
      "Add shortlisted candidates + resumes into the open Candidate File (/candidate-file).",
      "Then ask Michelle to screen the new shortlist (same role) and record Q&A on that file.",
      "Ask Gina for the pipeline summary to confirm this Maria update under Team updates.",
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
  const isStatusUpdate =
    /\b(update|status|progress|report|check[- ]?in)\b/i.test(String(task || "")) &&
    !Array.isArray(result?.screeningQuestions);
  const qs = Array.isArray(result?.screeningQuestions)
    ? result.screeningQuestions
    : [];

  return [
    `Michelle — ${isStatusUpdate ? "status" : "screening"} update (${stamp()})`,
    "",
    `Request: ${task}`,
    role ? `Role focus: ${role}` : null,
    result?.jobDescriptionUsed
      ? `Job description: used from Jobs tab / Candidate File (${result.jobDescriptionChars || 0} chars) — no paste required.`
      : "Job description: not found on the open job — select the job on Jobs (or open the Candidate File) so screening questions match the requisition.",
    names.length ? `Named candidates: ${names.join(", ")}` : null,
    "",
    "Status:",
    bullets(
      [
        qs.length
          ? `Generated ${qs.length} screening question(s) from the job description${result?.candidateFileId ? ` and saved them on Candidate File ${result.candidateFileId}` : ""}.`
          : null,
        reviewed != null
          ? `Working a screen pass on ${reviewed} candidate(s) with resume text on file.`
          : "Reviewing candidates with resume text on file against the open requisition.",
        "Screening questions + answers stay on the Candidate File (/candidate-file) for client review.",
        "Will flag strong fits for Screening / Interview and note gaps for Kimberley.",
        "No auto-reject without Kimberley approval on edge cases.",
      ].filter(Boolean),
    ),
    qs.length
      ? ["", "Screening questions:", ...qs.map((q, i) => `${i + 1}. ${q}`)].join(
          "\n",
        )
      : null,
    "",
    filedToBothBlock(),
    "",
    "Handoff:",
    bullets([
      "Strong fits → Kelley for unambiguous stage moves.",
      "Gaps / edge cases → Kimberley's Notes until Kimberley decides.",
      "When Q&A is complete → Export Candidate File for client review.",
      "Approved outreach targets → Ashton for draft follow-ups.",
      "Ask Gina for the pipeline summary to confirm this Michelle update under Team updates.",
    ]),
  ]
    .filter((l) => l != null)
    .join("\n");
}

export function buildKelleyReply({ task, result } = {}) {
  const text = String(task || "");
  const isBlog = /blog/i.test(text);
  const isStatusUpdate =
    /\b(update|status|progress|report|check[- ]?in|what(?:'s| is) (?:the )?status)\b/i.test(
      text,
    ) && !isBlog;
  const names = extractQuotedNames(task);
  const stage = extractStageHint(task) || result?.stage || "";
  const stageMoves = Array.isArray(result?.stageMoves)
    ? result.stageMoves.filter((m) => m?.name && m?.stage)
    : Array.isArray(result?.boardActions)
      ? result.boardActions
          .map((a) => ({
            name: a?.payload?.match?.name || a?.match?.name,
            stage: a?.payload?.stage || a?.stage,
          }))
          .filter((m) => m.name && m.stage)
      : [];

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
      filedToBothBlock(),
      "",
      "Handoff: Kimberley reads Notes; ask Gina for the pipeline summary to see this in Team updates.",
    ].join("\n");
  }

  if (isStatusUpdate) {
    return [
      `Kelley — status update (${stamp()})`,
      "",
      `Request: ${task}`,
      "",
      "Pipeline ops status:",
      bullets([
        "Reviewing open ATS actions: stages waiting on moves, notes due, and blocked items.",
        "New / Screening / Interview / Offer — flagging anything stuck or missing owners.",
        "Candidate File handoffs (Maria → Michelle) stay on /candidate-file when present.",
        "Anything needing Kimberley's decision will be listed explicitly in Notes.",
      ]),
      "",
      filedToBothBlock(),
      "",
      "Handoff:",
      bullets([
        "Kimberley — open Kimberley's Notes for this full reply.",
        "Kimberley — ask Gina for the pipeline summary; this update must appear under Team updates.",
        "Michelle — re-screen if new resumes landed since last pass.",
        "Ashton — outreach only after Kimberley clears the list.",
      ]),
    ].join("\n");
  }

  const moveLines = stageMoves.length
    ? stageMoves.map(
        (m) =>
          `Board move: ${m.name} → ${stageLabel(m.stage)} (card slides under that column).`,
      )
    : stage && names.length
      ? [
          `Board move: ${names.join(", ")} → ${stageLabel(stage)} (card slides under that column).`,
        ]
      : [];

  return [
    `Kelley — pipeline ops update (${stamp()})`,
    "",
    `Request: ${task}`,
    names.length ? `Candidates: ${names.join(", ")}` : null,
    stage ? `Requested stage: ${stageLabel(stage)}` : null,
    "",
    "Status:",
    bullets([
      ...(moveLines.length
        ? moveLines
        : ["Working the ATS pipeline: stages, notes, and housekeeping."]),
      "Board columns: New → Screening → Interview → Offer → Hired / Rejected.",
      "Anything needing Kimberley's call will stay in Notes until approved.",
    ]),
    "",
    filedToBothBlock(),
    "",
    "Handoff:",
    bullets([
      "Confirm the Board tab — moved candidates should sit under the new column.",
      "After stage moves, Michelle can re-screen if new resumes land.",
      "Ashton drafts outreach only for stages Kimberley has cleared.",
      "Ask Gina for the pipeline summary to confirm this update is listed under Team updates.",
    ]),
  ]
    .filter((l) => l != null)
    .join("\n");
}

export function buildAshtonReply({ task, result } = {}) {
  const isProject = /project status|status update|project|update|progress|report|check[- ]?in/i.test(
    String(task || ""),
  );
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
      ]),
      "",
      filedToBothBlock(),
      "",
      "Handoff: Kimberley approves drafts → Ashton queues sends → Kelley keeps stages in sync. Ask Gina for the pipeline summary to confirm this Ashton update under Team updates.",
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
    ]),
    "",
    filedToBothBlock(),
    "",
    "Handoff:",
    bullets([
      "Kimberley reviews drafts in Approvals / Notes.",
      "After send/approval, Kelley can advance stage (e.g. Screening → Interview).",
      "Michelle owns screen notes if a reply changes fit.",
      "Ask Gina for the pipeline summary to confirm this Ashton update under Team updates.",
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
    "Acknowledged.",
    "",
    filedToBothBlock(),
  ].join("\n");
}

export default buildBotReply;
