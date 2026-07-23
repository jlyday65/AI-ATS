/**
 * Drop-in replacement for Gina middleware/authApp.js (or authApp.js at repo root).
 *
 * WHY SignalHire gets 401 {"error":"Not authenticated"}:
 *   app.use(requireAppAuth) runs BEFORE /ats routes.
 *   Without the hasValidRelaySecret bypass below, X-Relay-Secret never reaches /ats.
 *
 * Paste this as your authApp.js (adjust import path for cookie helpers if needed).
 */
import crypto from "crypto";

function wantsJson(req) {
  const accept = String(req.get("accept") || "");
  const xhr = String(req.get("x-requested-with") || "").toLowerCase();
  return (
    accept.includes("application/json") ||
    xhr === "xmlhttprequest" ||
    req.path.startsWith("/ats") ||
    req.path.startsWith("/maria") ||
    req.path.startsWith("/michelle") ||
    req.path.startsWith("/kelly") ||
    req.path.startsWith("/ashton") ||
    req.path.startsWith("/chat") ||
    req.path.startsWith("/webhooks") ||
    req.path.startsWith("/api")
  );
}

function hasValidRelaySecret(req) {
  const secret = process.env.RELAY_SECRET;
  if (!secret) return false;

  const headerSecret =
    req.get("x-relay-secret") ||
    req.headers["x-relay-secret"] ||
    "";
  const auth = req.get("authorization") || req.headers.authorization || "";
  const bearer = String(auth).replace(/^Bearer\s+/i, "").trim();
  const provided = String(headerSecret || bearer || "").trim();

  if (!provided || provided.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
}

function isAppSessionOk(req) {
  // Cookie / session gate — keep whatever your Gina UI already uses.
  // Common patterns:
  if (req.session?.appAuthed === true) return true;
  if (req.cookies?.gina_app_auth === "1") return true;
  if (req.cookies?.app_auth === process.env.APP_PASSWORD) return true;

  // Some Gina builds store a signed flag:
  if (req.signedCookies?.appAuthed === true) return true;

  return false;
}

/**
 * Global middleware (server.js: app.use(requireAppAuth))
 */
export function requireAppAuth(req, res, next) {
  // Public paths (adjust to match your server.js allowlist if you have one)
  const openPaths = [
    "/login",
    "/auth/app-login",
    "/health",
    "/healthz",
    "/favicon.ico",
  ];
  if (openPaths.some((p) => req.path === p || req.path.startsWith(p + "/"))) {
    return next();
  }

  // 1) Browser UI session
  if (isAppSessionOk(req)) return next();

  // 2) SignalHire / bots — THIS LINE IS REQUIRED
  if (hasValidRelaySecret(req)) return next();

  // 3) Reject
  if (wantsJson(req)) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  return res.redirect("/login");
}

export { hasValidRelaySecret, wantsJson };
