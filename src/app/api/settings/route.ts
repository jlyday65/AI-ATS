import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAppPassword } from "@/lib/auth/session";
import {
  ATS_MODE_COOKIE,
  SESSION_COOKIE,
  SESSION_TIMEOUT_COOKIE,
  SESSION_TIMEOUT_OPTIONS,
  normalizeAtsMode,
  normalizeSessionTimeout,
} from "@/lib/settings";
import { getAppSettings, updateAppSettings } from "@/lib/store";

const schema = z.object({
  atsMode: z.enum(["test", "live"]),
  sessionTimeoutMinutes: z.union([z.literal(5), z.literal(10), z.literal(15)]),
});

export async function GET() {
  const settings = getAppSettings();
  return NextResponse.json({
    settings,
    options: {
      atsMode: ["test", "live"],
      sessionTimeoutMinutes: SESSION_TIMEOUT_OPTIONS,
    },
    livePasswordConfigured: Boolean(resolveAppPassword()),
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.atsMode === "live" && !resolveAppPassword()) {
    return NextResponse.json(
      {
        error:
          "Set SIGNALHIRE_APP_PASSWORD in .env.local before switching to live mode.",
        hint: "app_password_not_configured",
      },
      { status: 400 },
    );
  }

  const settings = updateAppSettings({
    atsMode: normalizeAtsMode(parsed.data.atsMode),
    sessionTimeoutMinutes: normalizeSessionTimeout(
      parsed.data.sessionTimeoutMinutes,
    ),
  });

  const response = NextResponse.json({
    ok: true,
    settings,
    message:
      settings.atsMode === "live"
        ? `Live mode on — password re-entry every ${settings.sessionTimeoutMinutes} min of idle time.`
        : "Test mode on — demo labels (signalhire-test / ats-test); no password gate.",
  });

  response.cookies.set(ATS_MODE_COOKIE, settings.atsMode, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  response.cookies.set(SESSION_TIMEOUT_COOKIE, String(settings.sessionTimeoutMinutes), {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });

  // Switching mode or timeout clears the live session so the client re-auths.
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });

  return response;
}
