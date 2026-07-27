/**
 * Format Gina pipeline summary for morning briefings.
 *
 * Canonical section title: "Pipeline Stage Counts"
 */

export const PIPELINE_STAGES = [
  { key: "new", label: "New" },
  { key: "screening", label: "Screening" },
  { key: "interview", label: "Interview" },
  { key: "offer", label: "Offer" },
  { key: "hired", label: "Hired" },
  { key: "rejected", label: "Rejected" },
];

/**
 * @param {Record<string, number>} stageCounts
 * @returns {string}
 */
export function formatPipelineStageCounts(stageCounts = {}) {
  const lines = ["Pipeline Stage Counts"];
  for (const stage of PIPELINE_STAGES) {
    const n = Number(stageCounts[stage.key] ?? stageCounts[stage.label] ?? 0);
    lines.push(`${stage.label}: ${Number.isFinite(n) ? n : 0}`);
  }
  const known = new Set(PIPELINE_STAGES.flatMap((s) => [s.key, s.label]));
  for (const [key, value] of Object.entries(stageCounts)) {
    if (known.has(key)) continue;
    lines.push(`${key}: ${Number(value) || 0}`);
  }
  return lines.join("\n");
}

/**
 * Build a full morning briefing text block.
 */
export function formatMorningPipelineBriefing({
  stageCounts = {},
  remindersDue = [],
  pipelineDetail = [],
  teamUpdates = [],
  asOf = new Date().toISOString(),
} = {}) {
  const sections = [];
  sections.push(`Gina morning briefing — ${asOf}`);
  sections.push("");
  sections.push(formatPipelineStageCounts(stageCounts));

  if (Array.isArray(remindersDue) && remindersDue.length) {
    sections.push("");
    sections.push("Due reminders");
    for (const item of remindersDue.slice(0, 12)) {
      const label =
        typeof item === "string"
          ? item
          : item.text || item.title || item.name || JSON.stringify(item);
      sections.push(`• ${label}`);
    }
  }

  const active = (pipelineDetail || []).filter(
    (c) => c.stage !== "hired" && c.stage !== "rejected" && c.stage !== "Hired" && c.stage !== "Rejected",
  );
  if (active.length) {
    sections.push("");
    sections.push("Active pipeline (days in stage)");
    for (const c of active.slice(0, 20)) {
      const days = c.daysInStage ?? c.days ?? "?";
      sections.push(
        `• ${c.name || "Candidate"} — ${c.role || "role"} · ${c.stage || "?"} · ${days}d`,
      );
    }
  }

  if (Array.isArray(teamUpdates) && teamUpdates.length) {
    sections.push("");
    sections.push("Team updates (Kimberley's Notes)");
    for (const note of teamUpdates.slice(0, 10)) {
      const from = note.from || note.fromAgent || "Team";
      const preview = String(note.reply || "")
        .split("\n")
        .filter(Boolean)
        .slice(0, 3)
        .join(" / ");
      sections.push(`• ${from}: ${preview || note.task || "update"}`);
    }
  }

  return sections.join("\n");
}

export default formatMorningPipelineBriefing;
