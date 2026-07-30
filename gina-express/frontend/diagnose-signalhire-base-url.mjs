#!/usr/bin/env node
/**
 * Diagnose Gina → SignalHire Maria bridge (404 / 401).
 *
 * ONE LINE:
 *   node gina-express/frontend/diagnose-signalhire-base-url.mjs https://YOUR-AI-ATS.vercel.app
 *
 * Or read from env:
 *   SIGNALHIRE_BASE_URL=https://… node gina-express/frontend/diagnose-signalhire-base-url.mjs
 */

const raw = String(
  process.argv[2] ||
    process.env.SIGNALHIRE_BASE_URL ||
    process.env.AI_ATS_BASE_URL ||
    "",
)
  .trim()
  .replace(/\/$/, "");

if (!raw) {
  console.error(`Usage:
  node diagnose-signalhire-base-url.mjs https://YOUR-AI-ATS.vercel.app

This must be the AI-ATS / SignalHire public host (serves /api/maria/source),
NOT Gina (lyday-gina-backend-production.up.railway.app).`);
  process.exit(1);
}

const base = raw.includes("://") ? raw : `https://${raw}`;
const url = `${base.replace(/\/$/, "")}/api/maria/source`;

console.log("Probing GET", url);

const res = await fetch(url, {
  headers: { "ngrok-skip-browser-warning": "true", Accept: "application/json" },
});
const text = await res.text();
let json = null;
try {
  json = JSON.parse(text);
} catch {
  /* not json */
}

console.log("HTTP", res.status);
console.log("Body:", text.slice(0, 400));

if (res.status === 404) {
  console.error(`
FAIL: 404 — this host does not serve /api/maria/source.
Deploy AI-ATS (this repo) and set Gina Railway SIGNALHIRE_BASE_URL to that URL.
`);
  process.exit(2);
}

if (json?.endpoint === "POST /api/maria/source" || json?.agent === "maria") {
  console.log(`
OK: SignalHire Maria endpoint is reachable.
relayConfigured: ${json.relayConfigured}
Set on Gina Railway:
  SIGNALHIRE_BASE_URL=${base.replace(/\/$/, "")}
  RELAY_SECRET=<same secret as SignalHire /ats>
Then redeploy Gina and re-run Check for actions.
`);
  process.exit(0);
}

if (res.status === 401 && json?.hint) {
  console.log(`
Partial: host responded (not 404) but requires auth on GET.
If this is AI-ATS with a custom gate, try POST with X-Relay-Secret.
Gina Railway SIGNALHIRE_BASE_URL=${base.replace(/\/$/, "")}
`);
  process.exit(0);
}

console.warn(`
Unexpected response. Expected JSON like { agent: "maria", endpoint: "POST /api/maria/source" }.
`);
process.exit(3);
