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
  sections.push(`Pipeline briefing — ${asOf}`);
  sections.push("");
  sections.push(formatPipelineStageCounts(stageCounts));

  // Always show reminders section (cleaner than emoji blocks)
  sections.push("");
  sections.push("Reminders due");
  if (Array.isArray(remindersDue) && remindersDue.length) {
    for (const item of remindersDue.slice(0, 12)) {
      const label =
        typeof item === "string"
          ? item
          : item.text || item.title || item.name || JSON.stringify(item);
      sections.push(`- ${label}`);
    }
  } else {
    sections.push("- None");
  }

  const active = (pipelineDetail || []).filter(
    (c) =>
      c.stage !== "hired" &&
      c.stage !== "rejected" &&
      c.stage !== "Hired" &&
      c.stage !== "Rejected",
  );
  if (active.length) {
    sections.push("");
    sections.push("Active pipeline");
    for (const c of active.slice(0, 20)) {
      const days = c.daysInStage ?? c.days ?? "?";
      sections.push(
        `- ${c.name || "Candidate"} — ${c.role || "role"} · ${c.stage || "?"} · ${days}d`,
      );
    }
  }

  sections.push("");
  sections.push("Team updates (Kimberley Notes)");
  if (Array.isArray(teamUpdates) && teamUpdates.length) {
    for (const note of teamUpdates.slice(0, 10)) {
      const from = note.from || note.fromAgent || "Team";
      const role = note.role || note.agentRole || "";
      const preview = String(note.reply || "")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !/^Request:/i.test(l) && !new RegExp(`^${from}`, "i").test(l))
        .slice(0, 2)
        .join(" · ");
      const who = role ? `${from} (${role})` : from;
      sections.push(`- ${who}: ${preview || note.task || "update filed"}`);
    }
  } else {
    sections.push("- None yet — ask Gina to command Maria / Michelle / Kelley / Ashton, then Check for actions");
  }

  return sections.join("\n");
}

export default formatMorningPipelineBriefing;
