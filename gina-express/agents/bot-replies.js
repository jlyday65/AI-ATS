/**
 * Structured status replies for Maria / Michelle / Kelley / Ashton.
 * Used when Check for actions runs a command_agent (and for Maria sourcing).
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

export function buildMariaReply({ task, result } = {}) {
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
  return [
    `Maria — sourcing update (${stamp()})`,
    "",
    `Request: ${task || "Source candidates"}`,
    job ? `Role: ${job}` : null,
    mode ? `ATS mode: ${mode}` : null,
    `Shortlist ready: ${count} candidate(s)`,
    names.length ? `Top names: ${names.join(", ")}` : null,
    "",
    "Next: Gina ATS → Agent → Check for actions to import any remaining candidates.",
  ]
    .filter((l) => l != null)
    .join("\n");
}

export function buildMichelleReply({ task } = {}) {
  return [
    `Michelle — screening update (${stamp()})`,
    "",
    `Request: ${task}`,
    "",
    "Status:",
    bullets([
      "Reviewing candidates with resume text on file against the open requisition.",
      "Will flag strong fits for Screening / Interview and note gaps for Kimberley.",
      "No auto-reject without Kimberley approval on edge cases.",
    ]),
    "",
    "I will post a follow-up note when the first screen pass is complete.",
  ].join("\n");
}

export function buildKelleyReply({ task } = {}) {
  const isBlog = /blog/i.test(String(task || ""));
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
      "This update is also queued for Gina's morning Pipeline Stage Counts briefing.",
    ].join("\n");
  }
  return [
    `Kelley — pipeline ops update (${stamp()})`,
    "",
    `Request: ${task}`,
    "",
    "Status:",
    bullets([
      "Working the ATS pipeline: stages, notes, and housekeeping.",
      "Will move candidates only when the stage is unambiguous (New → Screening → Interview → Offer).",
      "Anything needing Kimberley's call will stay in Notes until approved.",
    ]),
    "",
    "Follow-up will land in Kimberley's Note Panel when complete.",
  ].join("\n");
}

export function buildAshtonReply({ task } = {}) {
  const isProject = /project status|status update|project/i.test(String(task || ""));
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
      "Expect a tighter roll-up after the next outreach sync.",
    ].join("\n");
  }
  return [
    `Ashton — outreach update (${stamp()})`,
    "",
    `Request: ${task}`,
    "",
    "Status:",
    bullets([
      "Drafting or queueing outreach / follow-ups tied to ATS records.",
      "Nothing sends externally without Kimberley approval when Approvals is enabled.",
      "Completed drafts appear here and feed Gina's briefing roll-up.",
    ]),
  ].join("\n");
}

export function buildBotReply({ agentId, task, result } = {}) {
  const id = String(agentId || "").toLowerCase();
  if (id === "maria") return buildMariaReply({ task, result });
  if (id === "michelle") return buildMichelleReply({ task });
  if (id === "kelley" || id === "kelly") return buildKelleyReply({ task });
  if (id === "ashton") return buildAshtonReply({ task });
  return [
    `Team update (${stamp()})`,
    "",
    `Request: ${task || "(none)"}`,
    "Acknowledged — follow-up will appear in Kimberley's Note Panel.",
  ].join("\n");
}

export default buildBotReply;
