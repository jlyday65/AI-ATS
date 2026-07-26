/**
 * Gina Maria → SignalHire sourcing bridge
 *
 * Drop into Gina (e.g. next to routes/maria.js). Wire `mariaSourceTool` into
 * Maria's tool list AND paste MARIA_SOURCE_PROMPT_RULE.txt into her system prompt
 * so she does not refuse sourcing with "only three ATS actions".
 *
 * Env on Gina (Railway):
 *   RELAY_SECRET          — same secret as SignalHire /ats
 *   SIGNALHIRE_BASE_URL   — e.g. https://your-signalhire.example.com
 *                           (local: http://host.docker.internal:3000)
 */

const SIGNALHIRE_BASE_URL = (
  process.env.SIGNALHIRE_BASE_URL ||
  process.env.AI_ATS_BASE_URL ||
  "http://localhost:3000"
).replace(/\/$/, "");

/** Pull role title from free-text task when queue payload omits roleTitle. */
export function extractRoleTitleFromText(text = "") {
  const t = String(text || "").trim();
  if (!t) return "";
  const patterns = [
    /\bsource\s+(?:an?\s+|a\s+)?(.+?)\s+candidate/i,
    /\bsource\s+(?:an?\s+|a\s+)?(.+?)(?:\s+in\s+|\s+for\s+|[.!]|$)/i,
    /\b(?:find|recruit|hire)\s+(?:an?\s+|a\s+)?(.+?)(?:\s+candidate|\s+in\s+|\s+for\s+|[.!]|$)/i,
    /\bfor\s+(?:the\s+)?(.+?)(?:\s+role|\s+in\s+|[.!]|$)/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]) {
      return m[1]
        .replace(/\b(with|that|who|all)\b.*$/i, "")
        .replace(/[?.!,;:]+$/g, "")
        .trim();
    }
  }
  return "";
}

export function extractLocationFromText(text = "") {
  const m = String(text || "").match(/\bin\s+([A-Za-z .]+(?:,\s*[A-Z]{2})?)/i);
  return (m?.[1] || "").replace(/[?.!,;:]+$/g, "").trim();
}

/**
 * Ask SignalHire (as Maria) to source a role and optionally push to Gina.
 *
 * @param {object} input
 * @param {string} [input.roleTitle]
 * @param {string} [input.roleDescription]
 * @param {string[]} [input.requiredSkills]
 * @param {string[]} [input.preferredSkills]
 * @param {string} [input.location]
 * @param {string} [input.seniority]
 * @param {boolean} [input.resumesRequired]
 * @param {boolean} [input.pushToGina=true]
 * @param {number} [input.pushTopN=5]
 * @param {number} [input.limit=24]
 */
export async function mariaSourceViaSignalHire(input = {}) {
  const secret = String(process.env.RELAY_SECRET || "").trim();
  if (!secret) {
    throw new Error("Gina RELAY_SECRET is not set — cannot call SignalHire as Maria.");
  }

  // Flatten any nested strings — queued actions vary widely in shape.
  const blobParts = [];
  const walk = (v, d = 0) => {
    if (v == null || d > 5) return;
    if (typeof v === "string") {
      const t = v.trim();
      if (t) blobParts.push(t);
      return;
    }
    if (Array.isArray(v)) return v.forEach((x) => walk(x, d + 1));
    if (typeof v === "object") {
      for (const [k, val] of Object.entries(v)) {
        if (k.startsWith("_")) continue;
        walk(val, d + 1);
      }
    }
  };
  walk(input);
  const blob = blobParts.join("\n");

  const taskText =
    input.task ||
    input.Task ||
    input.instruction ||
    input.message ||
    input.description ||
    input.roleDescription ||
    input.notes ||
    input.text ||
    blob;

  const roleTitle = String(
    input.roleTitle ||
      input.role_title ||
      input.title ||
      input.jobTitle ||
      input.job_title ||
      input.context?.roleTitle ||
      extractRoleTitleFromText(taskText) ||
      extractRoleTitleFromText(blob) ||
      "",
  ).trim();
  if (!roleTitle) {
    throw new Error(
      'Maria needs a roleTitle to source. Could not infer from payload. Re-queue with roleTitle: "Warehouse Assistant Manager" or task containing "source a … candidate".',
    );
  }

  if (!input.location && !input.context?.location) {
    const loc = extractLocationFromText(taskText);
    if (loc) input = { ...input, location: loc };
  } else if (!input.location && input.context?.location) {
    input = { ...input, location: input.context.location };
  }

  const resumesRequired =
    input.resumesRequired === true ||
    input.context?.resumesRequired === true ||
    /resume/i.test(String(taskText)) ||
    /resume/i.test(String(input.roleDescription || "")) ||
    input.requireResume === true;

  const response = await fetch(`${SIGNALHIRE_BASE_URL}/api/maria/source`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Send ONE header only — Express joins duplicates into "secret, secret".
      "X-Relay-Secret": secret,
      // ngrok free tier otherwise returns an interstitial HTML page to server fetches
      "ngrok-skip-browser-warning": "true",
    },
    body: JSON.stringify({
      roleTitle,
      roleDescription: input.roleDescription || input.description || taskText || undefined,
      requiredSkills: input.requiredSkills,
      preferredSkills: input.preferredSkills,
      location: input.location,
      seniority: input.seniority,
      resumesRequired,
      pushToGina: input.pushToGina !== false,
      pushTopN: input.pushTopN ?? 5,
      limit: input.limit ?? 24,
      jobId: input.jobId || input.context?.jobId,
      platformIds: input.platformIds,
    }),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      json.error ||
      json.hint ||
      `SignalHire Maria source failed (${response.status})`;
    const err = new Error(detail);
    err.status = response.status;
    err.body = json;
    throw err;
  }

  return {
    ok: true,
    ...json,
    nextStep:
      json.nextStep ||
      "In Gina ATS → Agent → Check for actions to import the shortlist.",
  };
}

/**
 * Tool descriptor for Maria's agent loop / action queue.
 * Name must stay: source_candidates_signalhire
 */
export const mariaSourceTool = {
  name: "source_candidates_signalhire",
  description:
    "REQUIRED for any request to source, find, recruit, identify, or shortlist candidates for a role/location. Uses SignalHire multi-platform search and pushes top matches into Gina ATS with resume text when resumesRequired is true. Do not refuse sourcing; do not ask the user to convert the request into create_candidate/update_stage/add_note.",
  parameters: {
    type: "object",
    required: ["roleTitle"],
    properties: {
      roleTitle: {
        type: "string",
        description: 'Job title to source, e.g. "Warehouse Mechanic"',
      },
      roleDescription: {
        type: "string",
        description: "Extra requirements (e.g. resumes on file).",
      },
      requiredSkills: { type: "array", items: { type: "string" } },
      preferredSkills: { type: "array", items: { type: "string" } },
      location: {
        type: "string",
        description: 'City/region, e.g. "Atlanta, GA"',
      },
      seniority: { type: "string" },
      resumesRequired: {
        type: "boolean",
        description:
          "When true, only push candidates that have full resume text on file.",
      },
      pushTopN: { type: "number" },
      pushToGina: { type: "boolean" },
    },
  },
  handler: mariaSourceViaSignalHire,
};

export default mariaSourceViaSignalHire;
