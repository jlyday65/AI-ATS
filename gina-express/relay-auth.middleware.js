/**
 * Express middleware for Gina ATS bot/API auth.
 *
 * Usage (in Gina server.js / index.js / app.js), BEFORE /api routes:
 *
 *   const { relayAuth } = require("./relay-auth.middleware");
 *   app.use("/api", relayAuth);
 *
 * Accepted credentials:
 *   - Header: X-Relay-Secret: <RELAY_SECRET>
 *   - Header: Authorization: Bearer <RELAY_SECRET>
 *
 * If process.env.RELAY_SECRET is unset, auth is skipped (local UI/dev).
 */
const crypto = require("crypto");

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function relayAuth(req, res, next) {
  const secret = process.env.RELAY_SECRET;
  if (!secret) return next();

  const headerSecret = req.get("x-relay-secret") || "";
  const auth = req.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  const provided = headerSecret || bearer;

  if (!provided || !safeEqual(provided, secret)) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  return next();
}

module.exports = { relayAuth, safeEqual };
