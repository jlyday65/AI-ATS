/**
 * Board pipeline stages — single source of truth for column keys.
 * Cards slide by candidate.stage matching these lowercase keys.
 */

export const BOARD_STAGE_KEYS = [
  "new",
  "screening",
  "interview",
  "offer",
  "hired",
  "rejected",
];

const STAGE_ALIASES = {
  new: "new",
  screening: "screening",
  screen: "screening",
  phone_screen: "screening",
  phonescreen: "screening",
  phone: "screening",
  pre_screen: "screening",
  prescreen: "screening",
  interview: "interview",
  interviewing: "interview",
  interviews: "interview",
  on_site: "interview",
  onsite: "interview",
  final: "interview",
  offer: "offer",
  offered: "offer",
  hired: "hired",
  hire: "hired",
  rejected: "rejected",
  reject: "rejected",
  rejection: "rejected",
  declined: "rejected",
  pass: "rejected",
};

/**
 * Normalize any spoken / Title Case / alias stage to a Board column key.
 * Returns null when the value cannot be mapped (caller may keep existing stage).
 */
export function normalizeBoardStageKey(raw, { fallback = null } = {}) {
  let s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[→➞]/g, " ")
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_");
  if (!s) return fallback;
  if (STAGE_ALIASES[s]) return STAGE_ALIASES[s];
  // "phone screen" after replace → phone_screen already handled
  if (s.includes("phone") && s.includes("screen")) return "screening";
  if (s.includes("interview")) return "interview";
  if (s.includes("reject") || s.includes("decline")) return "rejected";
  if (BOARD_STAGE_KEYS.includes(s)) return s;
  return fallback;
}

/**
 * For Board column filters: unknown → "new" so cards still appear somewhere.
 */
export function boardColumnKey(raw) {
  return normalizeBoardStageKey(raw, { fallback: "new" }) || "new";
}

function uniqNames(names) {
  const out = [];
  const seen = new Set();
  for (const n of names) {
    const name = String(n || "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** Pull candidate names from a Kelley / Kimberley instruction. */
export function extractCandidateNames(task = "") {
  const text = String(task || "");
  const names = [];

  const quoted = /["']([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})["']/g;
  let m;
  while ((m = quoted.exec(text))) names.push(m[1]);

  const patterns = [
    /\b(?:reject(?:ed)?|pass\s+on)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
    /\b(?:move|advance|promote|send|slide)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:to|into|→)/gi,
    /\b(?:screen|screening)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:to|→)\s+(?:the\s+|an?\s+)?(?:new|screening|phone\s*screen|interview(?:ing)?|offer|hired|rejected)\b/gi,
  ];
  for (const re of patterns) {
    re.lastIndex = 0;
    while ((m = re.exec(text))) {
      if (m[1] && !/^(Maria|Michelle|Kelley|Kelly|Ashton|Gina)$/i.test(m[1])) {
        names.push(m[1]);
      }
    }
  }
  return uniqNames(names).slice(0, 8);
}

/**
 * Parse Board moves from natural language.
 * @returns {Array<{ name: string, stage: string }>}
 */
export function parseBoardStageMoves(task = "") {
  const text = String(task || "");
  const moves = [];

  const push = (name, stageRaw) => {
    const stage = normalizeBoardStageKey(stageRaw);
    const n = String(name || "").trim();
    if (!stage || !n) return;
    if (/^(Maria|Michelle|Kelley|Kelly|Ashton|Gina)$/i.test(n)) return;
    moves.push({ name: n, stage });
  };

  const nameTok = String.raw`["']?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)["']?`;
  const stageTok = String.raw`(new|screening|phone\s*screens?|interview(?:ing|s)?|offer|hired|rejected?|phone\s*screen)`;

  // reject Ivy Kim / rejected Ava Foster
  {
    const re = new RegExp(
      String.raw`\b(?:reject(?:ed)?|pass\s+on)\s+${nameTok}`,
      "gi",
    );
    let m;
    while ((m = re.exec(text))) push(m[1], "rejected");
  }

  // move/advance Ava Foster to interview|Phone Screen|...
  {
    const re = new RegExp(
      String.raw`\b(?:move|advance|promote|send|slide)\s+${nameTok}\s+(?:to|into|→)\s+(?:the\s+|an?\s+)?${stageTok}\b`,
      "gi",
    );
    let m;
    while ((m = re.exec(text))) push(m[1], m[2]);
  }

  // Ava Foster to interview (without move verb)
  {
    const re = new RegExp(
      String.raw`\b${nameTok}\s+(?:to|→)\s+(?:the\s+|an?\s+)?${stageTok}\b`,
      "gi",
    );
    let m;
    while ((m = re.exec(text))) push(m[1], m[2]);
  }

  // screen Ivy Kim → screening
  {
    const re = new RegExp(
      String.raw`\b(?:screen|screening)\s+${nameTok}`,
      "gi",
    );
    let m;
    while ((m = re.exec(text))) push(m[1], "screening");
  }

  // Quoted name + stage elsewhere in the same task
  {
    const quoted = extractCandidateNames(text);
    const stageOnly = text.match(
      /\b(?:to|into|→)\s+(?:the\s+|an?\s+)?(new|screening|phone\s*screens?|interview(?:ing|s)?|offer|hired|rejected?)\b/i,
    );
    if (quoted.length && stageOnly?.[1] && !moves.length) {
      for (const name of quoted) push(name, stageOnly[1]);
    }
  }

  // Dedupe by name (last stage wins)
  const byName = new Map();
  for (const move of moves) byName.set(move.name.toLowerCase(), move);
  return [...byName.values()];
}

/**
 * Build applyAgentAction-ready boardActions from a task.
 */
export function boardActionsFromTask(task = {}, extra = {}) {
  const text = typeof task === "string" ? task : String(task?.task || "");
  return parseBoardStageMoves(text).map((move) => ({
    type: "update_stage",
    payload: {
      match: { name: move.name },
      stage: move.stage,
      jobTitle: extra.jobTitle || "",
      role: extra.jobTitle || "",
      candidateFileId: extra.candidateFileId,
    },
  }));
}
