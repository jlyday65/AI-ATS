/**
 * Count Board candidates by pipeline stage.
 * Pipeline summaries must use THIS — never invent New: 64 from chat memory.
 */

export const LIVE_STAGE_KEYS = [
  "new",
  "screening",
  "interview",
  "offer",
  "hired",
  "rejected",
];

function normalizeStage(raw) {
  let s = String(raw || "new")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (
    s === "phone_screen" ||
    s === "phonescreen" ||
    s === "pre_screen" ||
    s === "prescreen" ||
    s === "screen"
  ) {
    return "screening";
  }
  if (s === "on_site" || s === "onsite" || s === "final") return "interview";
  if (LIVE_STAGE_KEYS.includes(s)) return s;
  // Unknown / blank → New (sourced, not yet advanced)
  return "new";
}

/**
 * @param {Array<{ stage?: string, status?: string }>} candidates
 * @returns {Record<string, number>}
 */
export function countLiveStageCounts(candidates = []) {
  const counts = Object.fromEntries(LIVE_STAGE_KEYS.map((k) => [k, 0]));
  for (const c of Array.isArray(candidates) ? candidates : []) {
    const key = normalizeStage(c?.stage ?? c?.status);
    counts[key] += 1;
  }
  return counts;
}

export function totalLiveCandidates(stageCounts = {}) {
  return LIVE_STAGE_KEYS.reduce((n, k) => n + (Number(stageCounts[k]) || 0), 0);
}
