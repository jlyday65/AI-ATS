import { NextResponse, type NextRequest } from "next/server";

/**
 * Restores RELAY_SECRET authentication for every `/api/*` route.
 *
 * Callers (bots such as SignalHire, Gina webhooks, other integrations) must
 * present the shared secret as either:
 *   - `X-Relay-Secret: <RELAY_SECRET>`
 *   - `Authorization: Bearer <RELAY_SECRET>`
 *
 * The value is compared against `process.env.RELAY_SECRET`. When no
 * `RELAY_SECRET` is configured (e.g. local development), auth is disabled so the
 * app and its UI keep working without a secret.
 */

/** Constant-time string comparison to avoid leaking the secret via timing. */
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);

  // Always walk the longer buffer so the loop length does not reveal which
  // input was shorter; a length mismatch still fails.
  const length = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < length; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

function extractProvidedSecrets(request: NextRequest): string[] {
  const provided: string[] = [];

  const relayHeader = request.headers.get("x-relay-secret")?.trim();
  if (relayHeader) {
    provided.push(relayHeader);
  }

  const authHeader = request.headers.get("authorization")?.trim();
  if (authHeader) {
    const bearer = /^Bearer\s+(.+)$/i.exec(authHeader);
    if (bearer?.[1]) {
      provided.push(bearer[1].trim());
    }
  }

  return provided;
}

export function middleware(request: NextRequest) {
  const secret = (process.env.RELAY_SECRET ?? "").trim();

  // Auth is disabled when no RELAY_SECRET is configured (local dev / demo).
  if (!secret) {
    return NextResponse.next();
  }

  const provided = extractProvidedSecrets(request);
  const authorized = provided.some((candidate) => timingSafeEqual(candidate, secret));

  if (authorized) {
    return NextResponse.next();
  }

  return NextResponse.json(
    {
      error: "Unauthorized",
      message:
        "Missing or invalid RELAY_SECRET. Send it as 'X-Relay-Secret: <secret>' or 'Authorization: Bearer <secret>'.",
    },
    { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
  );
}

export const config = {
  matcher: "/api/:path*",
};
