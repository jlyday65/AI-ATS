/**
 * Gina recruiting team — canonical bot registry.
 *
 * Kimberley (operator) asks Gina (orchestrator).
 * Gina commands: Maria, Michelle, Kelley, Ashton.
 *
 * Note: Kelley's HTTP route is `/kelly` (existing Gina mount).
 */

export const GINA_TEAM = {
  gina: {
    id: "gina",
    displayName: "Gina",
    aliases: ["gina"],
    route: "/chat",
    role: "Orchestrator",
    summary:
      "Receives Kimberley's requests and commands Maria, Michelle, Kelley, and Ashton.",
    capabilities: ["command_agent", "create_candidate", "update_stage", "add_note"],
  },
  maria: {
    id: "maria",
    displayName: "Maria",
    aliases: ["maria"],
    route: "/maria",
    role: "Sourcer",
    summary:
      "Sources candidates (SignalHire multi-platform search) and pushes shortlists into Gina with resume text when required.",
    capabilities: ["source_candidates_signalhire"],
  },
  michelle: {
    id: "michelle",
    displayName: "Michelle",
    aliases: ["michelle"],
    route: "/michelle",
    role: "Screener",
    summary:
      "Screens candidates against job requirements, reviews resume text on file, and recommends stage moves or rejection reasons.",
    capabilities: ["screen_candidate", "add_note", "update_stage"],
  },
  kelley: {
    id: "kelley",
    displayName: "Kelley",
    aliases: ["kelley", "kelly"],
    route: "/kelly",
    role: "Pipeline ops",
    summary:
      "Keeps the ATS pipeline clean: stage updates, notes, job/candidate housekeeping, and action follow-through.",
    capabilities: ["update_stage", "add_note", "create_candidate"],
  },
  ashton: {
    id: "ashton",
    displayName: "Ashton",
    aliases: ["ashton"],
    route: "/ashton",
    role: "Outreach",
    summary:
      "Drafts and queues candidate/client outreach, follow-ups, and engagement notes tied to ATS records.",
    capabilities: ["draft_outreach", "add_note"],
  },
};

/** Operator who issues requests to Gina */
export const OPERATOR = {
  id: "kimberley",
  displayName: "Kimberley",
  aliases: ["kimberley", "kim", "kimberly"],
  role: "Operator",
};

export function normalizeAgentName(raw) {
  const key = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  if (!key) return null;
  if (GINA_TEAM[key]) return key;
  for (const bot of Object.values(GINA_TEAM)) {
    if (bot.aliases.includes(key)) return bot.id;
  }
  return null;
}

export function resolveAgent(raw) {
  const id = normalizeAgentName(raw);
  return id ? GINA_TEAM[id] : null;
}

export function listCommandableAgents() {
  return ["maria", "michelle", "kelley", "ashton"].map((id) => GINA_TEAM[id]);
}

export default GINA_TEAM;
