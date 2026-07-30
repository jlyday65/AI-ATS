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
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function displayAgentName(raw) {
  const key = String(raw || "").trim().toLowerCase();
  if (key === "kelly" || key === "kelley") return "Kelley";
  if (!raw) return "Team";
  return String(raw);
}

function previewTeamUpdate(note, from) {
  const reply = String(note.reply || "");
  const lines = reply
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^Request:/i.test(l))
    .filter((l) => !/^Handoff:/i.test(l))
    // Drop only the title line "Kelley — status update (...)", not body lines
    .filter(
      (l) =>
        !new RegExp(`^${escapeRegExp(from)}\\s*[—\\-]`, "i").test(l) &&
        !/^kelly\s*[—\-]/i.test(l) &&
        !/^kelley\s*[—\-]/i.test(l),
    )
    .filter(
      (l) =>
        !/^(Pipeline ops status|Status|Outreach \/ project snapshot|Screening update):?$/i.test(
          l,
        ),
    );

  const bullets = lines
    .filter((l) => /^[-•*]/.test(l))
    .map((l) => l.replace(/^[-•*]\s*/, ""))
    .slice(0, 2);
  const prose = lines.filter((l) => !/^[-•*]/.test(l)).slice(0, 1);
  const preview = [...bullets, ...prose].filter(Boolean).slice(0, 2).join(" · ");
  return preview || note.task || "update filed";
}

function prioritizeTeamUpdates(teamUpdates) {
  const rank = (n) => {
    const from = String(n.from || n.fromAgent || "").toLowerCase();
    if (from === "kelley" || from === "kelly") return 0;
    if (from === "maria") return 1;
    if (from === "michelle") return 2;
    if (from === "ashton") return 3;
    return 4;
  };
  return [...teamUpdates].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    const ta = Date.parse(a.at || a.createdAt || 0) || 0;
    const tb = Date.parse(b.at || b.createdAt || 0) || 0;
    return tb - ta;
  });
}

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
    // Prefer newest first; keep Kelley/Kelly/Maria/Michelle/Ashton visible
    const ordered = prioritizeTeamUpdates(teamUpdates).slice(0, 12);
    for (const note of ordered) {
      const from = displayAgentName(note.from || note.fromAgent || "Team");
      const role = note.role || note.agentRole || "";
      const preview = previewTeamUpdate(note, from);
      const who = role ? `${from} (${role})` : from;
      sections.push(`- ${who}: ${preview}`);
    }
  } else {
    sections.push("- None yet — ask Gina to command Maria / Michelle / Kelley / Ashton, then Check for actions");
  }

  return sections.join("\n");
}

export default formatMorningPipelineBriefing;
