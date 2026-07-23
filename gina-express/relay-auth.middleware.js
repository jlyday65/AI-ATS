/**
 * Express middleware for Gina (and any Express /api surface) that restores
 * RELAY_SECRET auth for every `/api` route.
 *
 * Accepts either header when `process.env.RELAY_SECRET` is set:
 *   - X-Relay-Secret: <secret>
 *   - Authorization: Bearer <secret>
 *
 * When RELAY_SECRET is unset, auth is skipped (local/dev).
 *
 * Drop into the Gina Express app (server.js / index.js / app.js) BEFORE
 * `/api` routers:
 *
 *   const { relayAuth } = require("./relay-auth.middleware");
 *   app.use("/api", relayAuth);
 *
 * Then commit, push, and Redeploy the Gina Railway service.
 */

const crypto = require("crypto");

function timingSafeEqualString(a, b) {
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));
  if (aBuf.length !== bBuf.length) {
    // Compare against self so timing does not leak length; still fail.
    crypto.timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function extractProvidedSecrets(req) {
  const provided = [];

  const relayHeader = String(req.get("x-relay-secret") || "").trim();
  if (relayHeader) provided.push(relayHeader);

  const authHeader = String(req.get("authorization") || "").trim();
  const bearer = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (bearer?.[1]) provided.push(bearer[1].trim());

  return provided;
}

function relayAuth(req, res, next) {
  const secret = String(process.env.RELAY_SECRET || "").trim();

  // Auth disabled when RELAY_SECRET is not configured.
  if (!secret) return next();

  const provided = extractProvidedSecrets(req);
  const ok = provided.some((candidate) => timingSafeEqualString(candidate, secret));

  if (ok) return next();

  // Match Gina's existing 401 body so SignalHire / bots see a familiar error.
  return res.status(401).json({ error: "Not authenticated" });
}

module.exports = { relayAuth, extractProvidedSecrets, timingSafeEqualString };
