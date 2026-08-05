import { NextResponse, type NextRequest } from "next/server";
import {
  ATS_MODE_COOKIE,
  SESSION_COOKIE,
  SESSION_TIMEOUT_COOKIE,
  livePasswordGateEnabled,
  normalizeAtsMode,
  normalizeSessionTimeout,
  readAtsModeFromEnv,
} from "@/lib/settings";
import {
  refreshSessionToken,
  sessionCookieOptions,
  verifySessionToken,
} from "@/lib/auth/session";

const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/maria",
  "/_next",
  "/favicon.ico",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function resolveMode(request: NextRequest) {
  const fromCookie = request.cookies.get(ATS_MODE_COOKIE)?.value;
  if (fromCookie === "live" || fromCookie === "test") return fromCookie;
  return readAtsModeFromEnv() ?? "test";
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const mode = resolveMode(request);
  if (mode !== "live") return NextResponse.next();

  const timeout = normalizeSessionTimeout(
    request.cookies.get(SESSION_TIMEOUT_COOKIE)?.value,
  );

  // Seamless live: timeout 0 (Never) or SIGNALHIRE_DISABLE_LIVE_PASSWORD=1
  // skips browser password. Maria/Check for actions already use /api/maria + RELAY_SECRET.
  if (!livePasswordGateEnabled(timeout)) {
    const response = NextResponse.next();
    response.cookies.set(ATS_MODE_COOKIE, normalizeAtsMode(mode), {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
    response.cookies.set(SESSION_TIMEOUT_COOKIE, String(timeout), {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const verified = await verifySessionToken(token);

  if (!verified.ok) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error: "Session expired — re-enter password",
          hint: "live_session_required",
          atsMode: "live",
          sessionTimeoutMinutes: timeout,
        },
        { status: 401 },
      );
    }
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    login.searchParams.set("reason", verified.reason);
    return NextResponse.redirect(login);
  }

  // Sliding expiry: refresh on each authenticated page/API hit.
  const response = NextResponse.next();
  const refreshed = await refreshSessionToken(timeout);
  const maxAgeSeconds = timeout === 0 ? 60 * 60 * 24 * 365 : timeout * 60;
  const opts = sessionCookieOptions(maxAgeSeconds);
  response.cookies.set(opts.name, refreshed, opts);
  response.cookies.set(ATS_MODE_COOKIE, normalizeAtsMode(mode), {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  response.cookies.set(SESSION_TIMEOUT_COOKIE, String(timeout), {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
