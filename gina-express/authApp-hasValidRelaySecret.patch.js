/**
 * REPLACE only hasValidRelaySecret + the 401 JSON line in your authApp.js
 * with the versions below. Keep the rest of your file as-is.
 */

function hasValidRelaySecret(req) {
  // Trim — Railway / pasted secrets often include trailing newlines.
  const secret = String(process.env.RELAY_SECRET || "").trim();
  if (!secret) return false;

  const headerSecret = String(
    req.get?.("x-relay-secret") ||
      req.headers?.["x-relay-secret"] ||
      req.headers?.["X-Relay-Secret"] ||
      "",
  ).trim();

  const auth = String(req.get?.("authorization") || req.headers?.authorization || "");
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  const provided = headerSecret || bearer;

  if (!provided || provided.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
}

// Inside requireAppAuth, REPLACE the 401 return with:
//
// return res.status(401).json({
//   error: "Not authenticated",
//   hint: !process.env.RELAY_SECRET
//     ? "relay_secret_not_configured_on_gina"
//     : (req.get("x-relay-secret") || req.headers["x-relay-secret"])
//       ? "relay_secret_mismatch"
//       : "relay_secret_header_missing",
//   relayConfigured: Boolean(String(process.env.RELAY_SECRET || "").trim()),
//   headerPresent: Boolean(
//     req.get("x-relay-secret") || req.headers["x-relay-secret"] || req.headers.authorization
//   ),
// });
