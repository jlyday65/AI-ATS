/**
 * Gina auth.js — ensure requireRelaySecret accepts SignalHire headers.
 *
 * routes/ats.js uses: import { requireRelaySecret } from "../auth.js";
 *
 * Replace or merge your requireRelaySecret with this:
 */

/*
import crypto from "crypto";

export function requireRelaySecret(req, res, next) {
  const secret = process.env.RELAY_SECRET;
  if (!secret) {
    // If unset, allow (local/dev) — or return 500 if you want to force config in prod
    return next();
  }

  const headerSecret =
    req.get("x-relay-secret") ||
    req.get("X-Relay-Secret") ||
    req.get("relay-secret") ||
    "";
  const bearer = (req.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const provided = headerSecret || bearer;

  if (!provided || provided.length !== secret.length) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const ok = crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
  if (!ok) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  return next();
}
*/
