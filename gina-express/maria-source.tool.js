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
      "SIGNALHIRE_BASE_URL is not set on Gina. Set it to your AI-ATS / SignalHire public URL (the host that serves POST /api/maria/source), then redeploy. Example: https://abcd.ngrok-free.dev — NOT Gina's Railway URL.",
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
      `SIGNALHIRE_BASE_URL looks like Gina's Railway host glued onto ngrok (${host}). Use the https://….ngrok-free.dev URL printed by "ngrok http 3000" while AI-ATS runs on port 3000.`,
    );
  }

  if (/gina|lyday-gina-backend/i.test(host) && /railway\.app$/i.test(host)) {
    throw new Error(
      `SIGNALHIRE_BASE_URL points at Gina (${host}). It must point at AI-ATS (ngrok/Vercel), e.g. https://abcd.ngrok-free.dev`,
    );
  }

  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(withProto)) {
    const onRailway = Boolean(
      process.env.RAILWAY_ENVIRONMENT ||
        process.env.RAILWAY_PROJECT_ID ||
        process.env.RAILWAY_SERVICE_ID,
    );
    if (onRailway) {
      throw new Error(
        `SIGNALHIRE_BASE_URL is ${withProto}, which is not reachable from Railway. Set it to your public AI-ATS URL (ngrok/Vercel), not localhost.`,
      );
    }
  }

  return withProto;
}

export { resolveSignalHireBaseUrl };

const ROLE_NOISE = new Set(
  [
    "candidate",
    "candidates",
    "people",
    "person",
    "someone",
    "somebody",
    "talent",
    "profile",
    "profiles",
    "resume",
    "resumes",
    "update",
    "status",
    "maria",
    "michelle",
    "kelley",
    "kelly",
    "ashton",
    "gina",
    "kimberley",
    "kimberly",
    "signalhire",
    "open role",
    "the role",
    "a role",
    "this role",
  ].map((s) => s.toLowerCase()),
);

function cleanRoleCapture(raw = "") {
  let s = String(raw || "")
    .replace(/^["'`{\[\s]+/, "")
    .replace(/["'`}\]\s]+$/, "")
    .replace(/\b(with|that|who|which|all|and)\b.*$/i, "")
    .replace(/\s+candidates?\b.*$/i, "")
    .replace(/\s+role\b.*$/i, "")
    .replace(/[?.!,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // Drop leading articles / filler
  s = s.replace(/^(?:an?\s+|the\s+|some\s+|any\s+)/i, "").trim();
  if (!s) return "";
  if (ROLE_NOISE.has(s.toLowerCase())) return "";
  // Too short / not a job title
  if (s.length < 3 || s.length > 80) return "";
  if (/^(for|in|to|from|with|and|or)$/i.test(s)) return "";
  return s;
}

/**
 * Pull role title from free-text task when queue payload omits roleTitle.
 * Handles common Kimberley / Gina phrasings, including
 * "source candidates for Warehouse Assistant Manager in Atlanta".
 */
export function extractRoleTitleFromText(text = "") {
  const t = String(text || "").trim();
  if (!t) return "";

  const patterns = [
    // Explicit fields (JSON fragments / notes) — Gina often queues "role" not "roleTitle"
    // Note: do NOT use \b before " — `{`/`"` are both non-word so \b"role" never matches.
    /"roleTitle"\s*:\s*"([^"]+)"/gi,
    /"jobTitle"\s*:\s*"([^"]+)"/gi,
    /"role"\s*:\s*"([^"]+)"/gi,
    /\brole(?:\s*title)?\s*[:=]\s*["']?([^"'\n,}+]+)/gi,
    /\bjob(?:\s*title)?\s*[:=]\s*["']?([^"'\n,}+]+)/gi,
    // "… for the Warehouse Assistant Manager role"
    /\bfor\s+(?:the\s+)?(.+?)\s+role\b/gi,
    // "source candidates for X" / "find candidates for X"
    /\b(?:source|find|recruit|hire|shortlist|identify)\s+candidates?\s+for\s+(?:the\s+|an?\s+|a\s+)?(.+?)(?:\s+in\s+|\s+with\s+|\s+who\s+|[.!;,]|$)/gi,
    // "source a X candidate"
    /\b(?:source|find|recruit|hire|shortlist|identify)\s+(?:an?\s+|a\s+)?(.+?)\s+candidates?\b/gi,
    // "source X in Atlanta" / "source X for …"
    /\b(?:source|find|recruit|hire|shortlist|identify)\s+(?:an?\s+|a\s+)?(.+?)(?:\s+in\s+|\s+for\s+|[.!;,]|$)/gi,
    // "Warehouse Assistant Manager in Atlanta" (Title Case + location)
    /\b([A-Z][A-Za-z0-9/&-]+(?:\s+[A-Z][A-Za-z0-9/&-]+){1,6})\s+in\s+[A-Z]/,
  ];

  // Prefer the LAST good match — taskHint blobs often include older roles first.
  let last = "";
  for (const re of patterns) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(t))) {
      const cleaned = cleanRoleCapture(m[1]);
      if (cleaned) last = cleaned;
    }
    if (last) return last;
  }
  return "";
}

export function extractLocationFromText(text = "") {
  const t = String(text || "");
  const jsonLoc = t.match(/"location"\s*:\s*"([^"]+)"/i);
  if (jsonLoc?.[1]) {
    return jsonLoc[1].replace(/[?.!,;:]+$/g, "").trim();
  }
  const m = t.match(/\bin\s+([A-Za-z .]+(?:,\s*[A-Z]{2})?)/i);
  return (m?.[1] || "").replace(/[?.!,;:]+$/g, "").trim();
}

/** Infer bot id from free text / payload aliases. */
export function extractTargetAgentFromText(text = "") {
  const t = String(text || "");
  const patterns = [
    /"agent"\s*:\s*"([^"]+)"/i,
    /"targetAgent"\s*:\s*"([^"]+)"/i,
    /"assignedTo"\s*:\s*"([^"]+)"/i,
    /\b(?:ask|tell|have|get(?:\s+an?\s+update\s+from)?|from)\s+(maria|michelle|kelley|kelly|ashton)\b/i,
    /\b(maria|michelle|kelley|kelly|ashton)\b/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]) {
      const id = String(m[1]).trim().toLowerCase();
      if (id === "kelly") return "kelley";
      if (["maria", "michelle", "kelley", "ashton"].includes(id)) return id;
    }
  }
  return "";
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

  // Explicit roleTitle / task inference beat board jobTitle/title — those often
  // reflect the currently selected ATS job, not the role Kimberley asked for.
  const roleTitle = String(
    input.roleTitle ||
      input.role_title ||
      input.context?.roleTitle ||
      // Gina chat often queues { role: "Warehouse Assistant Manager", … }
      (input.role &&
      !/^(maria|michelle|kelley|kelly|ashton|gina|update|status)$/i.test(
        String(input.role).trim(),
      )
        ? input.role
        : "") ||
      extractRoleTitleFromText(taskText) ||
      extractRoleTitleFromText(blob) ||
      input.jobTitle ||
      input.job_title ||
      input.title ||
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

  // Always require mapped work history / resume text — not optional for Maria.
  const resumesRequired = true;

  // Prefer roleTitle over a stale board jobId (e.g. Senior Manager selected while
  // Kimberley asked for Operations Manager). Only forward jobId when it is the
  // sole selector or when no roleTitle was resolved.
  const jobId = input.jobId || input.context?.jobId;
  const baseUrl = resolveSignalHireBaseUrl();
  const sourceUrl = `${baseUrl}/api/maria/source`;
  let response;
  try {
    response = await fetch(sourceUrl, {
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
        roleDescription:
          input.roleDescription ||
          input.jobDescription ||
          input.description ||
          input.context?.roleDescription ||
          input.context?.jobDescription ||
          taskText ||
          undefined,
        requiredSkills:
          input.requiredSkills || input.context?.requiredSkills || undefined,
        preferredSkills:
          input.preferredSkills || input.context?.preferredSkills || undefined,
        location: input.location || input.context?.location,
        seniority: input.seniority || input.context?.seniority,
        resumesRequired,
        pushToGina: input.pushToGina !== false,
        pushTopN: input.pushTopN ?? 5,
        limit: input.limit ?? 24,
        // roleTitle is authoritative when present — omit jobId so SignalHire
        // cannot source the wrong open requisition from the ATS board selection.
        ...(roleTitle ? {} : jobId ? { jobId } : {}),
        platformIds: input.platformIds,
      }),
    });
  } catch (err) {
    throw new Error(
      `Maria could not reach SignalHire at ${sourceUrl}: ${err?.message || err}. Check SIGNALHIRE_BASE_URL on Gina Railway.`,
    );
  }

  const rawText = await response.text().catch(() => "");
  let json = {};
  try {
    json = rawText ? JSON.parse(rawText) : {};
  } catch {
    json = {};
  }
  if (!response.ok) {
    const snippet = rawText.replace(/\s+/g, " ").trim().slice(0, 160);
    let detail =
      (typeof json.error === "string" && json.error) ||
      json.hint ||
      `SignalHire Maria source failed (${response.status}) at ${sourceUrl}`;
    if (/ERR_NGROK_8012|failed to establish a connection to the upstream/i.test(rawText)) {
      detail = `ngrok reached your Mac but AI-ATS is not running on localhost:3000 (ERR_NGROK_8012). Start: cd ~/AI-ATS && npm run dev — leave it running with ngrok http 3000.`;
    } else if (/ERR_NGROK_3200|endpoint .+ is offline/i.test(rawText)) {
      detail = `SignalHire ngrok tunnel is OFFLINE (${sourceUrl}). On your Mac: start AI-ATS (npm run dev) and ngrok http 3000, then set Gina Railway SIGNALHIRE_BASE_URL to the new https://….ngrok-free.dev URL and redeploy (or update the env if the subdomain changed).`;
    } else if (response.status === 404) {
      detail = `SignalHire Maria source 404 at ${sourceUrl}. SIGNALHIRE_BASE_URL must be your AI-ATS public URL (serves GET/POST /api/maria/source), not Gina and not a dead Vercel host. ${snippet ? `Body: ${snippet}` : ""}`;
    } else if (response.status === 401) {
      detail = `SignalHire rejected RELAY_SECRET (${json.hint || "unauthorized"}) for ${sourceUrl}. Gina RELAY_SECRET must match SignalHire /ats secret.`;
    } else if (response.status === 502) {
      detail = `SignalHire ngrok returned 502 for ${sourceUrl}. Start AI-ATS on port 3000: cd ~/AI-ATS && npm run dev`;
    }
    const err = new Error(detail);
    err.status = response.status;
    err.body = json;
    err.url = sourceUrl;
    throw err;
  }

  return {
    ok: true,
    ...json,
    sourceUrl,
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
