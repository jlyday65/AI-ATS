#!/usr/bin/env node
/**
 * Diagnose Gina → SignalHire (AI-ATS) Maria bridge.
 *
 * RIGHT (AI-ATS via ngrok):
 *   node gina-express/frontend/diagnose-signalhire-base-url.mjs https://abcd-1234.ngrok-free.dev
 *
 * WRONG (do not use Gina's Railway host):
 *   … https://lyday-gina-backend-production.up.railway.app
 *   … https://lyday-gina-backend-production.up.railway.app.ngrok-free.dev
 */

const raw = String(
  process.argv[2] ||
    process.env.SIGNALHIRE_BASE_URL ||
    process.env.AI_ATS_BASE_URL ||
    "",
)
  .trim()
  .replace(/\/$/, "")
  .replace(/\/+$/, "");

if (!raw) {
  console.error(`Usage:
  node diagnose-signalhire-base-url.mjs https://YOUR-SUBDOMAIN.ngrok-free.dev

SIGNALHIRE_BASE_URL must be AI-ATS (this repo on your Mac via ngrok, or Vercel).
It must NOT be Gina:
  https://lyday-gina-backend-production.up.railway.app   ← Gina (wrong)
`);
  process.exit(1);
}

const base = (raw.includes("://") ? raw : `https://${raw}`).replace(/\/$/, "");
let host = "";
try {
  host = new URL(base).hostname;
} catch {
  console.error("FAIL: not a valid URL:", raw);
  process.exit(1);
}

// Common mistakes
if (/railway\.app\.ngrok/i.test(host) || /\.railway\.app\.ngrok-/i.test(host)) {
  console.error(`
FAIL: You glued Gina's Railway hostname onto .ngrok-free.dev:

  ${base}

That is not a real ngrok URL (TLS cert will also fail).

Do this instead:
  Terminal A:  cd ~/AI-ATS && npm run dev
  Terminal B:  ngrok http 3000

ngrok prints a URL like:
  https://some-random-words.ngrok-free.dev

Probe THAT url (copy/paste from the ngrok window — do not invent it):
  node gina-express/frontend/diagnose-signalhire-base-url.mjs https://some-random-words.ngrok-free.dev

Then set Gina Railway:
  SIGNALHIRE_BASE_URL=https://some-random-words.ngrok-free.dev
`);
  process.exit(1);
}

if (/gina|lyday-gina-backend/i.test(host) && /railway\.app$/i.test(host)) {
  console.error(`
FAIL: ${host} is Gina (Railway ATS), not AI-ATS / SignalHire.

Gina calls SIGNALHIRE_BASE_URL to reach Maria sourcing.
Set SIGNALHIRE_BASE_URL to your AI-ATS tunnel/Vercel URL, for example:
  https://some-random-words.ngrok-free.dev
`);
  process.exit(1);
}

if (/ngrok\.(io|app|dev|free\.dev)$/i.test(host) === false && /vercel\.app$/i.test(host) === false) {
  console.log(
    "Note: host is not *.ngrok-free.dev or *.vercel.app — continuing anyway.\n",
  );
}

const url = `${base}/api/maria/source`;
console.log("Probing GET", url);
console.log("(This must be AI-ATS, not Gina.)\n");

let res;
let text;
try {
  res = await fetch(url, {
    headers: {
      "ngrok-skip-browser-warning": "true",
      Accept: "application/json",
    },
  });
  text = await res.text();
} catch (err) {
  const msg = String(err?.cause?.message || err?.message || err);
  console.error("FAIL: fetch failed —", msg);
  if (/ALTNAME_INVALID|certificate/i.test(msg)) {
    console.error(`
TLS/hostname mismatch usually means the URL is wrong (not a real ngrok host).
Copy the https URL exactly from the ngrok terminal after: ngrok http 3000
`);
  }
  process.exit(1);
}

let json = null;
try {
  json = JSON.parse(text);
} catch {
  /* not json */
}

console.log("HTTP", res.status);
console.log("Body:", text.slice(0, 400));

if (res.status === 404) {
  if (/ERR_NGROK_3200|endpoint .+ is offline/i.test(text)) {
    console.error(`
FAIL: ngrok tunnel is OFFLINE (ERR_NGROK_3200).

  Terminal A:  cd ~/AI-ATS && npm run dev
  Terminal B:  ngrok http 3000

Leave both running, then re-probe the NEW https://….ngrok-free.dev URL.
`);
    process.exit(2);
  }
  console.error(`
FAIL: 404 — this host does not serve /api/maria/source.
Make sure Terminal A is running: cd ~/AI-ATS && npm run dev
And ngrok targets port 3000: ngrok http 3000
`);
  process.exit(2);
}

if (json?.endpoint === "POST /api/maria/source" || json?.agent === "maria") {
  console.log(`
OK: AI-ATS Maria endpoint is reachable.
relayConfigured: ${json.relayConfigured}

Set on Gina Railway (Variables), then redeploy:
  SIGNALHIRE_BASE_URL=${base}
  RELAY_SECRET=<same secret as SignalHire /ats>

Then Check for actions again.
`);
  process.exit(0);
}

if (res.status === 401 && json?.hint) {
  console.log(`
Partial: host responded (not 404) but GET required auth.
If relayConfigured looks fine, still set:
  SIGNALHIRE_BASE_URL=${base}
`);
  process.exit(0);
}

console.warn(`
Unexpected response. Expected JSON like { "agent": "maria", "endpoint": "POST /api/maria/source" }.
If this HTML is an ngrok interstitial, retry with the skip header (this script already sends it).
`);
process.exit(3);
