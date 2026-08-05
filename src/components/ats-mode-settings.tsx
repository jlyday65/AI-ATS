"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AtsMode, SessionTimeoutMinutes } from "@/lib/types";
import {
  SESSION_TIMEOUT_OPTIONS,
  livePasswordGateEnabled,
  sessionTimeoutLabel,
} from "@/lib/settings";

export function AtsModeSettings({
  initialMode,
  initialTimeout,
  livePasswordConfigured,
}: {
  initialMode: AtsMode;
  initialTimeout: SessionTimeoutMinutes;
  livePasswordConfigured: boolean;
}) {
  const router = useRouter();
  const [atsMode, setAtsMode] = useState<AtsMode>(initialMode);
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] =
    useState<SessionTimeoutMinutes>(initialTimeout);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ atsMode, sessionTimeoutMinutes }),
    });
    const json = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) {
      setMessage(json.error || "Could not save ATS mode.");
      return;
    }
    setMessage(json.message || "Saved.");
    router.refresh();
    // Only bounce to login when a password gate is actually on.
    if (atsMode === "live" && livePasswordGateEnabled(sessionTimeoutMinutes)) {
      router.push("/login?next=/ats&reason=mode_changed");
    }
  }

  return (
    <form onSubmit={onSave} className="mt-4 space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">ATS mode</legend>
        <label className="flex items-start gap-3 rounded-xl border border-line bg-white px-3 py-3">
          <input
            type="radio"
            name="atsMode"
            value="test"
            checked={atsMode === "test"}
            onChange={() => setAtsMode("test")}
            className="mt-1"
          />
          <span>
            <span className="font-semibold text-ink">Test</span>
            <span className="mt-0.5 block text-sm text-ink-soft">
              Maria tags pushes as <code className="text-ink">signalhire-test</code> /{" "}
              <code className="text-ink">ats-test</code>. No password gate.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-xl border border-line bg-white px-3 py-3">
          <input
            type="radio"
            name="atsMode"
            value="live"
            checked={atsMode === "live"}
            onChange={() => setAtsMode("live")}
            className="mt-1"
          />
          <span>
            <span className="font-semibold text-ink">Live</span>
            <span className="mt-0.5 block text-sm text-ink-soft">
              Production labels (<code className="text-ink">signalhire</code> /{" "}
              <code className="text-ink">ats-live</code>). Password gate is optional —
              choose <strong className="text-ink">Never</strong> below for seamless daily use.
            </span>
          </span>
        </label>
      </fieldset>

      <label className="block text-sm">
        <span className="font-medium text-ink">
          Live password re-entry
        </span>
        <select
          className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
          value={sessionTimeoutMinutes}
          onChange={(event) =>
            setSessionTimeoutMinutes(Number(event.target.value) as SessionTimeoutMinutes)
          }
          disabled={atsMode !== "live"}
        >
          {SESSION_TIMEOUT_OPTIONS.map((mins) => (
            <option key={mins} value={mins}>
              {sessionTimeoutLabel(mins)}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-ink-soft">
          Recommended: <strong className="text-ink">Never</strong>. Check for actions on Gina
          does not use this login — it calls Maria via <code className="text-ink">RELAY_SECRET</code>.
          Browser password is only for the SignalHire UI.
        </span>
      </label>

      {atsMode === "live" &&
      livePasswordGateEnabled(sessionTimeoutMinutes) &&
      !livePasswordConfigured ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-ink">
          Set <code className="text-ink">SIGNALHIRE_APP_PASSWORD</code> in{" "}
          <code className="text-ink">.env.local</code> before using a timed password gate —
          or switch the dropdown to <strong className="text-ink">Never</strong>.
        </p>
      ) : null}

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving..." : "Save ATS mode"}
      </button>
      {message ? <p className="text-sm font-medium text-ink">{message}</p> : null}
    </form>
  );
}
