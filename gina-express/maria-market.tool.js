/**
 * Gina Maria → SignalHire job market intel bridge
 *
 * Uses Coresignal Multi-source Jobs + Bright Data Jobs via AI-ATS:
 *   POST {SIGNALHIRE_BASE_URL}/api/maria/market
 *
 * Job-posting / competitive market research — not people sourcing.
 * For candidates, use maria-source.tool.js → /api/maria/source.
 *
 * Env on Gina (Railway):
 *   RELAY_SECRET
 *   SIGNALHIRE_BASE_URL
 */

function resolveSignalHireBaseUrl() {
  const raw = (
    process.env.SIGNALHIRE_BASE_URL ||
    process.env.AI_ATS_BASE_URL ||
    process.env.SIGNALHIRE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");

  if (!raw) {
    throw new Error(
      "SIGNALHIRE_BASE_URL is not set on Gina. Set it to your AI-ATS / SignalHire public URL (serves POST /api/maria/market).",
    );
  }

  const withProto = (raw.includes("://") ? raw : `https://${raw}`).replace(
    /\/$/,
    "",
  );

  let host = "";
  try {
    host = new URL(withProto).hostname;
  } catch {
    throw new Error(`SIGNALHIRE_BASE_URL is not a valid URL: ${raw}`);
  }

  if (/railway\.app\.ngrok/i.test(host)) {
    throw new Error(
      `SIGNALHIRE_BASE_URL looks like Gina's Railway host glued onto ngrok (${host}). Use the https://….ngrok-free.dev URL from ngrok.`,
    );
  }

  if (/gina|lyday-gina-backend/i.test(host) && /railway\.app$/i.test(host)) {
    throw new Error(
      `SIGNALHIRE_BASE_URL points at Gina (${host}). It must point at AI-ATS (ngrok/Vercel).`,
    );
  }

  return withProto;
}

export async function mariaMarketViaSignalHire(input = {}) {
  const roleTitle = String(
    input.roleTitle || input.role || input.title || "",
  ).trim();
  if (!roleTitle) {
    throw new Error(
      'Maria market research needs roleTitle, e.g. "Operations Manager".',
    );
  }

  const baseUrl = resolveSignalHireBaseUrl();
  const secret = (
    process.env.RELAY_SECRET ||
    process.env.GINA_RELAY_SECRET ||
    ""
  ).trim();
  if (!secret) {
    throw new Error(
      "RELAY_SECRET is not set on Gina for SignalHire market calls.",
    );
  }

  const marketUrl = `${baseUrl}/api/maria/market`;
  const body = {
    roleTitle,
    location: input.location || undefined,
    keywords: Array.isArray(input.keywords) ? input.keywords : undefined,
    limit: input.limit || 12,
    forceDemo: input.forceDemo === true,
  };

  let response;
  try {
    response = await fetch(marketUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Relay-Secret": secret,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(
      `Maria could not reach SignalHire market at ${marketUrl}: ${err?.message || err}`,
    );
  }

  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    const err = new Error(
      json.error ||
        `SignalHire Maria market failed (${response.status}) at ${marketUrl}`,
    );
    err.status = response.status;
    err.body = json;
    throw err;
  }

  return {
    ok: true,
    marketUrl,
    ...json,
  };
}

export const mariaMarketTool = {
  name: "research_job_market_signalhire",
  description:
    "Research competing job postings / market intel for a role using Coresignal + Bright Data Jobs via SignalHire. Use when Kimberley asks about market demand, competing employers, salary samples, or title variants. Do NOT use this for sourcing people — use source_candidates_signalhire for candidates.",
  input_schema: {
    type: "object",
    properties: {
      roleTitle: {
        type: "string",
        description: 'Job title to research, e.g. "Warehouse Mechanic"',
      },
      location: {
        type: "string",
        description: 'Optional location, e.g. "Atlanta, GA"',
      },
      keywords: {
        type: "array",
        items: { type: "string" },
        description: "Optional extra keywords",
      },
      limit: {
        type: "number",
        description: "Max postings to return (1–40)",
      },
    },
    required: ["roleTitle"],
  },
  handler: mariaMarketViaSignalHire,
};

export default mariaMarketViaSignalHire;
