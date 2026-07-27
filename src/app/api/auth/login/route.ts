import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSessionToken,
  passwordsMatch,
  resolveAppPassword,
  sessionCookieOptions,
} from "@/lib/auth/session";
import {
  ATS_MODE_COOKIE,
  SESSION_TIMEOUT_COOKIE,
  normalizeAtsMode,
  normalizeSessionTimeout,
} from "@/lib/settings";
import { getAppSettings } from "@/lib/store";

const schema = z.object({
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const settings = getAppSettings();
  if (settings.atsMode !== "live") {
    return NextResponse.json(
      { error: "Password gate is only required in live mode", atsMode: settings.atsMode },
      { status: 400 },
    );
  }

  const expected = resolveAppPassword();
  if (!expected) {
    return NextResponse.json(
      {
        error:
          "SIGNALHIRE_APP_PASSWORD is not set. Add it to .env.local before using live mode.",
        hint: "app_password_not_configured",
      },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }

  if (!passwordsMatch(parsed.data.password, expected)) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const timeout = normalizeSessionTimeout(settings.sessionTimeoutMinutes);
  const token = await createSessionToken(timeout);
  const response = NextResponse.json({
    ok: true,
    atsMode: "live",
    sessionTimeoutMinutes: timeout,
    message: `Signed in. Re-enter password after ${timeout} minutes of idle time.`,
  });
  const opts = sessionCookieOptions(timeout * 60);
  response.cookies.set(opts.name, token, opts);
  response.cookies.set(ATS_MODE_COOKIE, normalizeAtsMode("live"), {
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
