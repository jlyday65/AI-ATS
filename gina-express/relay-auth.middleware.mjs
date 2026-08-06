/**
 * ESM Express helper for Gina.
 * Prefer integrating RELAY_SECRET into authApp.js (see README).
 * This file can also be used as optional middleware.
 */
import crypto from "crypto";

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function hasValidRelaySecret(req) {
  const secret = process.env.RELAY_SECRET;
  if (!secret) return false;

  const headerSecret = req.get?.("x-relay-secret") || req.headers?.["x-relay-secret"] || "";
  const auth = req.get?.("authorization") || req.headers?.authorization || "";
  const bearer = String(auth).replace(/^Bearer\s+/i, "").trim();
  const provided = headerSecret || bearer;
  return Boolean(provided) && safeEqual(provided, secret);
}

/**
 * Optional standalone middleware.
 * Better: teach requireAppAuth to call hasValidRelaySecret(req) and allow through.
 */
export function relayAuth(req, res, next) {
  if (!process.env.RELAY_SECRET) return next();
  if (hasValidRelaySecret(req)) return next();
  return res.status(401).json({ error: "Not authenticated" });
}
