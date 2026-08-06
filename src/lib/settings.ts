import type { AppSettings, AtsMode, SessionTimeoutMinutes } from "@/lib/types";

export const ATS_MODE_COOKIE = "sh_ats_mode";
export const SESSION_TIMEOUT_COOKIE = "sh_session_timeout";
export const SESSION_COOKIE = "sh_session";

/** 0 = never re-prompt (no live password gate). */
export const SESSION_TIMEOUT_OPTIONS: SessionTimeoutMinutes[] = [
  0, 5, 10, 15, 60, 480,
];

export const DEFAULT_APP_SETTINGS: AppSettings = {
  atsMode: "test",
  // Seamless default: no browser password re-entry. Maria/Gina API uses RELAY_SECRET.
  sessionTimeoutMinutes: 0,
};

export function normalizeAtsMode(value: unknown): AtsMode {
  return value === "live" ? "live" : "test";
}

export function normalizeSessionTimeout(value: unknown): SessionTimeoutMinutes {
  const n = Number(value);
  if (
    n === 0 ||
    n === 5 ||
    n === 10 ||
    n === 15 ||
    n === 60 ||
    n === 480
  ) {
    return n;
  }
  return DEFAULT_APP_SETTINGS.sessionTimeoutMinutes;
}

/** Live UI password gate is off when timeout is 0 or env disables it. */
export function livePasswordGateEnabled(
  timeoutMinutes: SessionTimeoutMinutes | unknown,
): boolean {
  const envOff =
    process.env.SIGNALHIRE_DISABLE_LIVE_PASSWORD === "1" ||
    process.env.SIGNALHIRE_DISABLE_LIVE_PASSWORD === "true";
  if (envOff) return false;
  return normalizeSessionTimeout(timeoutMinutes) !== 0;
}

export function normalizeAppSettings(
  partial?: Partial<AppSettings> | null,
): AppSettings {
  return {
    atsMode: normalizeAtsMode(partial?.atsMode),
    sessionTimeoutMinutes: normalizeSessionTimeout(partial?.sessionTimeoutMinutes),
    updatedAt: partial?.updatedAt,
  };
}

/** Env bootstrap — used when store has no settings yet, and by proxy.ts. */
export function readAtsModeFromEnv(): AtsMode | null {
  const raw = (process.env.ATS_MODE || process.env.SIGNALHIRE_ATS_MODE || "")
    .trim()
    .toLowerCase();
  if (raw === "live" || raw === "test") return raw;
  return null;
}

export function sourceLabelForMode(mode: AtsMode): string {
  return mode === "live" ? "signalhire" : "signalhire-test";
}

export function modeTagForMode(mode: AtsMode): string {
  return mode === "live" ? "ats-live" : "ats-test";
}

export function sessionTimeoutLabel(mins: SessionTimeoutMinutes): string {
  if (mins === 0) return "Never (no password gate)";
  if (mins === 60) return "60 minutes (1 hour)";
  if (mins === 480) return "480 minutes (8 hours)";
  return `${mins} minutes`;
}
