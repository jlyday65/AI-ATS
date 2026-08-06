/**
 * Count Board candidates by pipeline stage.
 * Pipeline summaries must use THIS — never invent New: 64 from chat memory.
 */

import {
  BOARD_STAGE_KEYS,
  boardColumnKey,
} from "./board-stage.js";

export const LIVE_STAGE_KEYS = BOARD_STAGE_KEYS;

/**
 * @param {Array<{ stage?: string, status?: string }>} candidates
 * @returns {Record<string, number>}
 */
export function countLiveStageCounts(candidates = []) {
  const counts = Object.fromEntries(LIVE_STAGE_KEYS.map((k) => [k, 0]));
  for (const c of Array.isArray(candidates) ? candidates : []) {
    const key = boardColumnKey(c?.stage ?? c?.status);
    counts[key] += 1;
  }
  return counts;
}

export function totalLiveCandidates(stageCounts = {}) {
  return LIVE_STAGE_KEYS.reduce((n, k) => n + (Number(stageCounts[k]) || 0), 0);
}
