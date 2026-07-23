/**
 * Reference drop-in matching the user's current Gina authApp.js,
 * with a hardened hasValidRelaySecret + diagnostic 401 hints.
 *
 * Copy into Gina's authApp.js (usually repo root or middleware/).
 */
import crypto from "crypto";

const SESSION_SECRET =
  process.env.APP_SESSION_SECRET || process.env.RELAY_SECRET || "dev-secret-change-me";
const SESSION_COOKIE = "lyday_ats_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("hex");
}

function createSessionToken() {
  const expires = Date.now() + SESSION_DURATION_MS;
  return expires + "." + sign(String(expires));
}

function verifySessionToken(token) {
  if (!token) return false;
  const parts = token.split(".");
  const expiresStr = parts[0];
  const sig = parts[1];
  if (!expiresStr || !sig) return false;
  if (sign(expiresStr) !== sig) return false;
  return Date.now() < Number(expiresStr);
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  const parts = header.split(";");
  for (let i = 0; i < parts.length; i++) {
    const idx = parts[i].indexOf("=");
    if (idx === -1) continue;
    const key = parts[i].slice(0, idx).trim();
    const val = parts[i].slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

function fingerprintSecret(value) {
  const secret = String(value || "").trim();
  if (!secret) return "empty";
  const hash = crypto.createHash("sha256").update(secret).digest("hex").slice(0, 8);
  return `len=${secret.length},sha256_8=${hash}`;
}

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

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const attemptsByIp = new Map();

function getClientIp(req) {
  return req.ip || "unknown";
}

function lockoutMinutesRemaining(ip) {
  const record = attemptsByIp.get(ip);
  if (!record || record.count < MAX_ATTEMPTS) return 0;
  const elapsedMs = Date.now() - record.lastAttemptAt;
  if (elapsedMs > LOCKOUT_MS) {
    attemptsByIp.delete(ip);
    return 0;
  }
  return Math.ceil((LOCKOUT_MS - elapsedMs) / 60000);
}

function recordFailedAttempt(ip) {
  const record = attemptsByIp.get(ip) || { count: 0, lastAttemptAt: 0 };
  record.count += 1;
  record.lastAttemptAt = Date.now();
  attemptsByIp.set(ip, record);
}

function clearAttempts(ip) {
  attemptsByIp.delete(ip);
}

function loginPageHtml(showError, lockedOutMinutes) {
  let messageLine = "";
  if (lockedOutMinutes > 0) {
    messageLine =
      "<p style='color:#A34A42;font-size:13px;'>Too many attempts. Try again in " +
      lockedOutMinutes +
      " minute" +
      (lockedOutMinutes === 1 ? "" : "s") +
      ".</p>";
  } else if (showError) {
    messageLine = "<p style='color:#A34A42;font-size:13px;'>Incorrect password.</p>";
  }
  const disabled = lockedOutMinutes > 0 ? "disabled" : "";
  return (
    "<!doctype html><html><head><meta charset='utf-8'>" +
    "<meta name='viewport' content='width=device-width, initial-scale=1'>" +
    "<title>Lyday Talent Partners - Sign In</title></head>" +
    "<body style='font-family:sans-serif;background:#F6F4EF;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;'>" +
    "<div style='background:#fff;border:1px solid #E3DFD5;border-radius:12px;padding:32px;width:320px;'>" +
    "<h1 style='font-size:18px;margin:0 0 4px 0;'>Lyday Talent Partners</h1>" +
    "<p style='font-size:13px;color:#918D80;margin:0 0 20px 0;'>Enter the password to access the ATS.</p>" +
    messageLine +
    "<form method='POST' action='/auth/app-login'>" +
    "<input type='password' name='password' placeholder='Password' autofocus " +
    disabled +
    " style='width:100%;box-sizing:border-box;padding:10px 12px;border-radius:7px;border:1px solid #DCD8CB;font-size:14px;margin-bottom:12px;'>" +
    "<button type='submit' " +
    disabled +
    " style='width:100%;padding:10px;border-radius:7px;border:none;background:#2F6459;color:#fff;font-weight:600;font-size:14px;cursor:pointer;'>Sign in</button>" +
    "</form></div></body></html>"
  );
}

const EXEMPT_PATHS = [
  "/auth/app-login",
  "/auth/microsoft/login",
  "/auth/microsoft/callback",
  "/health",
  "/webhooks/candidate",
];

export function requireAppAuth(req, res, next) {
  if (!process.env.APP_PASSWORD) return next();
  if (EXEMPT_PATHS.indexOf(req.path) !== -1) return next();

  // Bot / SignalHire auth — must stay ABOVE the 401
  if (hasValidRelaySecret(req)) return next();

  const cookies = parseCookies(req);
  if (verifySessionToken(cookies[SESSION_COOKIE])) return next();

  const apiPrefixes = [
    "/api",
    "/chat",
    "/maria",
    "/michelle",
    "/kelly",
    "/ashton",
    "/ats",
    "/telegram",
    "/slack",
    "/whatsapp",
  ];
  for (let i = 0; i < apiPrefixes.length; i++) {
    if (req.path.indexOf(apiPrefixes[i]) === 0) {
      const headerPresent = Boolean(
        req.get("x-relay-secret") ||
          req.headers["x-relay-secret"] ||
          req.headers.authorization,
      );
      const provided = String(
        req.get("x-relay-secret") ||
          req.headers["x-relay-secret"] ||
          String(req.get("authorization") || "")
            .replace(/^Bearer\s+/i, "")
            .trim() ||
          "",
      ).trim();
      return res.status(401).json({
        error: "Not authenticated",
        hint: !String(process.env.RELAY_SECRET || "").trim()
          ? "relay_secret_not_configured_on_gina"
          : headerPresent
            ? "relay_secret_mismatch"
            : "relay_secret_header_missing",
        relayConfigured: Boolean(String(process.env.RELAY_SECRET || "").trim()),
        headerPresent,
        // Compare these two — they must be identical. Never logs the raw secret.
        serverFingerprint: fingerprintSecret(process.env.RELAY_SECRET),
        clientFingerprint: fingerprintSecret(provided),
      });
    }
  }

  const showError = req.query.error === "1";
  const lockedOutMinutes = lockoutMinutesRemaining(getClientIp(req));
  return res.send(loginPageHtml(showError, lockedOutMinutes));
}

export function appLoginHandler(req, res) {
  if (!process.env.APP_PASSWORD) return res.status(400).send("App password not configured");

  const ip = getClientIp(req);
  const lockedOutMinutes = lockoutMinutesRemaining(ip);
  if (lockedOutMinutes > 0) {
    return res.redirect("/");
  }

  const password = (req.body && req.body.password) || "";
  if (password !== process.env.APP_PASSWORD) {
    recordFailedAttempt(ip);
    return res.redirect("/?error=1");
  }

  clearAttempts(ip);
  res.cookie(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_DURATION_MS,
  });
  res.redirect("/");
}
