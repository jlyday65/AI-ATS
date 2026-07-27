import type { AppSettings, AtsMode, SessionTimeoutMinutes } from "@/lib/types";

export const ATS_MODE_COOKIE = "sh_ats_mode";
export const SESSION_TIMEOUT_COOKIE = "sh_session_timeout";
export const SESSION_COOKIE = "sh_session";

export const SESSION_TIMEOUT_OPTIONS: SessionTimeoutMinutes[] = [5, 10, 15];

export const DEFAULT_APP_SETTINGS: AppSettings = {
  atsMode: "test",
  sessionTimeoutMinutes: 15,
};

export function normalizeAtsMode(value: unknown): AtsMode {
  return value === "live" ? "live" : "test";
}

export function normalizeSessionTimeout(value: unknown): SessionTimeoutMinutes {
  const n = Number(value);
  if (n === 5 || n === 10 || n === 15) return n;
  return DEFAULT_APP_SETTINGS.sessionTimeoutMinutes;
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

/** Env bootstrap — used when store has no settings yet, and by middleware. */
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
