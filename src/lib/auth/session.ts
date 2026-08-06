import type { SessionTimeoutMinutes } from "@/lib/types";
import { SESSION_COOKIE } from "@/lib/settings";

function sessionSecret(): string {
  return (
    process.env.SIGNALHIRE_SESSION_SECRET ||
    process.env.RELAY_SECRET ||
    process.env.SIGNALHIRE_APP_PASSWORD ||
    "signalhire-dev-session"
  ).trim();
}

export function resolveAppPassword(): string {
  return (
    process.env.SIGNALHIRE_APP_PASSWORD ||
    process.env.APP_PASSWORD ||
    ""
  ).trim();
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return toHex(sig);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function passwordsMatch(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/** Create a session token: issuedAtMs.expiresAtMs.signature */
export async function createSessionToken(
  timeoutMinutes: SessionTimeoutMinutes,
  nowMs = Date.now(),
): Promise<string> {
  // 0 = never gate — still mint a long-lived token if login is used.
  const ttlMs =
    timeoutMinutes === 0 ? 365 * 24 * 60 * 60_000 : timeoutMinutes * 60_000;
  const expiresAt = nowMs + ttlMs;
  const payload = `${nowMs}.${expiresAt}`;
  return `${payload}.${await sign(payload)}`;
}

export async function verifySessionToken(
  token: string | undefined | null,
  nowMs = Date.now(),
): Promise<
  { ok: true; expiresAt: number; issuedAt: number } | { ok: false; reason: string }
> {
  if (!token) return { ok: false, reason: "missing" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [issuedRaw, expiresRaw, signature] = parts;
  const issuedAt = Number(issuedRaw);
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) {
    return { ok: false, reason: "invalid_times" };
  }
  const payload = `${issuedRaw}.${expiresRaw}`;
  const expected = await sign(payload);
  if (!timingSafeEqualHex(signature, expected)) {
    return { ok: false, reason: "bad_signature" };
  }
  if (nowMs > expiresAt) return { ok: false, reason: "expired" };
  return { ok: true, issuedAt, expiresAt };
}

/** Sliding window: issue a fresh token with the same timeout length. */
export async function refreshSessionToken(
  timeoutMinutes: SessionTimeoutMinutes,
  nowMs = Date.now(),
): Promise<string> {
  return createSessionToken(timeoutMinutes, nowMs);
}

export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
