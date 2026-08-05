/**
 * Format Gina pipeline overview for morning briefings.
 *
 * Match Kimberley's Notes style:
 * - Clear section headers
 * - Blank lines between blocks
 * - • bullets (same as bot replies in Notes)
 * - Team updates show Ask + full reply body (not one-line previews)
 * - Light emojis OK (user preference)
 *
 * Counts must reflect the LIVE Board — never invent New: 64 from chat memory.
 */

import {
  countLiveStageCounts,
  totalLiveCandidates,
} from "../lib/live-stage-counts.js";

export const PIPELINE_STAGES = [
  { key: "new", label: "New", emoji: "🆕" },
  { key: "screening", label: "Screening", emoji: "🔍" },
  { key: "interview", label: "Interview", emoji: "🎙️" },
  { key: "offer", label: "Offer", emoji: "📄" },
  { key: "hired", label: "Hired", emoji: "✅" },
  { key: "rejected", label: "Rejected", emoji: "❌" },
];

export { countLiveStageCounts, totalLiveCandidates };

/**
 * @param {Record<string, number>} stageCounts
 * @returns {string}
 */
export function formatPipelineStageCounts(stageCounts = {}) {
  const lines = ["📊 Pipeline Stage Counts", ""];
  for (const stage of PIPELINE_STAGES) {
    const n = Number(stageCounts[stage.key] ?? stageCounts[stage.label] ?? 0);
    const count = Number.isFinite(n) ? n : 0;
    lines.push(`• ${stage.emoji} ${stage.label}: ${count}`);
  }
  const known = new Set(PIPELINE_STAGES.flatMap((s) => [s.key, s.label]));
  for (const [key, value] of Object.entries(stageCounts)) {
    if (known.has(key)) continue;
    lines.push(`• ${key}: ${Number(value) || 0}`);
  }
  return lines.join("\n");
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function displayAgentName(raw) {
  const key = String(raw || "").trim().toLowerCase();
  if (key === "kelly" || key === "kelley") return "Kelley";
  if (!raw) return "Team";
  return String(raw);
}

function agentEmoji(raw) {
  const key = String(raw || "").trim().toLowerCase();
  if (key === "maria") return "👩‍💼";
  if (key === "michelle") return "🧑‍💻";
  if (key === "kelley" || key === "kelly") return "📋";
  if (key === "ashton") return "✉️";
  if (key === "gina") return "🤖";
  return "👤";
}

function formatStamp(value) {
  if (!value) return "";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString("en-US", {
      timeZone: "America/New_York",
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(value);
  }
}

/**
 * Format one Kimberley Note the same way the Notes panel shows it:
 * header + Ask + full reply (trimmed), using • bullets already in the reply.
 */
export function formatTeamUpdateLikeNotes(note = {}) {
  const from = displayAgentName(note.from || note.fromAgent || "Team");
  const role = note.role || note.agentRole || "";
  const when = formatStamp(note.at || note.createdAt);
  const emoji = agentEmoji(from);
  const header = role
    ? `${emoji} ${from} (${role})${when ? ` — ${when}` : ""}`
    : `${emoji} ${from}${when ? ` — ${when}` : ""}`;

  const task = String(note.task || "").trim();
  let reply = String(note.reply || "").trim();

  // Normalize dash bullets in older notes to Notes-style •
  reply = reply
    .split("\n")
    .map((line) => line.replace(/^\s*[-*]\s+/, "• "))
    .join("\n")
    .trim();

  // Keep replies readable in chat — cap very long Maria dumps.
  const replyLines = reply.split("\n");
  if (replyLines.length > 40) {
    reply = [...replyLines.slice(0, 40), "• …(full update in Kimberley's Notes)"].join(
      "\n",
    );
  } else if (reply.length > 2400) {
    reply = `${reply.slice(0, 2400)}\n• …(full update in Kimberley's Notes)`;
  }

  const block = [header];
  if (task) {
    block.push(`Ask: ${task}`);
  }
  if (reply) {
    block.push("");
    block.push(reply);
  } else if (task) {
    block.push("");
    block.push("• Update filed (see Kimberley's Notes for detail).");
  } else {
    block.push("");
    block.push("• Update filed.");
  }
  return block.join("\n");
}

/** @deprecated — kept for tests/callers that still import the short preview. */
export function previewTeamUpdate(note, from) {
  const reply = String(note?.reply || "");
  const lines = reply
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^Request:/i.test(l))
    .filter((l) => !/^Handoff:/i.test(l))
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
  return preview || note?.task || "update filed";
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
  boardCandidates = null,
  remindersDue = [],
  pipelineDetail = [],
  teamUpdates = [],
  asOf = new Date().toISOString(),
} = {}) {
  // Prefer live Board cards when provided — blocks invented New: 64 snapshots.
  const counts = Array.isArray(boardCandidates)
    ? countLiveStageCounts(boardCandidates)
    : stageCounts;

  const asOfLabel = formatStamp(asOf) || String(asOf);
  const sections = [];
  sections.push(`📋 Pipeline overview — ${asOfLabel} (live Board)`);
  sections.push("");
  sections.push(formatPipelineStageCounts(counts));
  sections.push("");
  sections.push(`• Total on Board: ${totalLiveCandidates(counts)}`);

  sections.push("");
  sections.push("⏰ Reminders due");
  if (Array.isArray(remindersDue) && remindersDue.length) {
    for (const item of remindersDue.slice(0, 12)) {
      const label =
        typeof item === "string"
          ? item
          : item.text ||
            item.title ||
            item.name ||
            [item.name, item.date, item.note].filter(Boolean).join(" · ") ||
            JSON.stringify(item);
      sections.push(`• ${label}`);
    }
  } else {
    sections.push("• None");
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
    sections.push("📁 Active pipeline");
    for (const c of active.slice(0, 20)) {
      const days = c.daysInStage ?? c.days ?? "?";
      sections.push(
        `• ${c.name || "Candidate"} — ${c.role || "role"} · ${c.stage || "?"} · ${days}d`,
      );
    }
  }

  sections.push("");
  sections.push("📝 Team updates (Kimberley Notes)");
  sections.push("");
  if (Array.isArray(teamUpdates) && teamUpdates.length) {
    const ordered = prioritizeTeamUpdates(teamUpdates).slice(0, 8);
    ordered.forEach((note, idx) => {
      sections.push(formatTeamUpdateLikeNotes(note));
      if (idx < ordered.length - 1) {
        sections.push("");
        sections.push("———");
        sections.push("");
      }
    });
  } else {
    sections.push(
      "• None yet — ask Gina to command Maria / Michelle / Kelley / Ashton, then Check for actions",
    );
  }

  return sections.join("\n");
}

export default formatMorningPipelineBriefing;
