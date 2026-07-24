/**
 * Gina Maria → SignalHire sourcing bridge
 *
 * Drop into Gina (e.g. routes/maria.js or tools used by the Maria bot).
 * Maria calls SignalHire; SignalHire sources + pushes candidates into Gina ATS.
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
 * @param {boolean} [input.pushToGina=true]
 * @param {number} [input.pushTopN=5]
 * @param {number} [input.limit=24]
 */
export async function mariaSourceViaSignalHire(input = {}) {
  const secret = String(process.env.RELAY_SECRET || "").trim();
  if (!secret) {
    throw new Error("Gina RELAY_SECRET is not set — cannot call SignalHire as Maria.");
  }

  const roleTitle = String(input.roleTitle || input.title || "").trim();
  if (!roleTitle) {
    throw new Error("Maria needs a roleTitle to source.");
  }

  const response = await fetch(`${SIGNALHIRE_BASE_URL}/api/maria/source`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Send ONE header only — Express joins duplicates into "secret, secret".
      "X-Relay-Secret": secret,
    },
    body: JSON.stringify({
      roleTitle,
      roleDescription: input.roleDescription || input.description,
      requiredSkills: input.requiredSkills,
      preferredSkills: input.preferredSkills,
      location: input.location,
      seniority: input.seniority,
      pushToGina: input.pushToGina !== false,
      pushTopN: input.pushTopN ?? 5,
      limit: input.limit ?? 24,
      jobId: input.jobId,
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
 * Example tool descriptor for Maria's agent loop.
 */
export const mariaSourceTool = {
  name: "source_candidates_signalhire",
  description:
    "Source candidates for a role via SignalHire multi-platform search and push the top matches into Gina ATS.",
  parameters: {
    type: "object",
    required: ["roleTitle"],
    properties: {
      roleTitle: { type: "string" },
      roleDescription: { type: "string" },
      requiredSkills: { type: "array", items: { type: "string" } },
      preferredSkills: { type: "array", items: { type: "string" } },
      location: { type: "string" },
      seniority: { type: "string" },
      pushTopN: { type: "number" },
      pushToGina: { type: "boolean" },
    },
  },
  handler: mariaSourceViaSignalHire,
};

export default mariaSourceViaSignalHire;
