"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AtsProviderMeta } from "@/lib/ats/providers";

interface ProbeResult {
  ok?: boolean;
  authenticated?: boolean;
  message?: string;
  nextStep?: string;
  authStrategy?: string;
  cookieReceived?: boolean;
  loginStatus?: number;
  loginLocation?: string;
  probedRoutes?: Array<{ path: string; status: number; ok: boolean }>;
}

export function AtsConnectForm({
  providers,
  clientVersion,
}: {
  providers: AtsProviderMeta[];
  clientVersion: string;
}) {
  const router = useRouter();
  const defaultProvider = providers.find((item) => item.id === "gina_ats") ?? providers[0];
  const [provider, setProvider] = useState(defaultProvider?.id ?? "gina_ats");
  const selected = providers.find((item) => item.id === provider) ?? defaultProvider;
  const [displayName, setDisplayName] = useState("Gina ATS Production");
  const [baseUrl, setBaseUrl] = useState(
    selected?.defaultBaseUrl ?? "https://lyday-gina-backend-production.up.railway.app",
  );
  const [relaySecret, setRelaySecret] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [nextStep, setNextStep] = useState<string | null>(null);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [pending, setPending] = useState(false);

  function applyProbe(json: { probe?: ProbeResult; message?: string } & ProbeResult) {
    const result = json.probe ?? json;
    setProbe(result);
    setMessage(result.message ?? json.message ?? "Done");
    setNextStep(result.nextStep ?? null);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (
      !relaySecret.trim() &&
      !appPassword.trim() &&
      !apiKey.trim() &&
      (provider === "gina_ats" || provider === "claude_ats")
    ) {
      setMessage("Enter RELAY_SECRET (preferred for bots) before saving.");
      setNextStep(
        "Create a new RELAY_SECRET in Railway Gina variables, redeploy Gina, then paste it here.",
      );
      return;
    }

    setPending(true);
    setMessage(null);
    setNextStep(null);
    const response = await fetch("/api/ats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        displayName,
        baseUrl,
        relaySecret: relaySecret || undefined,
        apiKey: apiKey || undefined,
        appPassword: appPassword || undefined,
        syncDirection: selected?.supportsBidirectional ? "bidirectional" : "push",
        demoMode: false,
      }),
    });
    const json = await response.json();
    setPending(false);
    if (!response.ok) {
      setMessage("Could not save ATS connection.");
      return;
    }
    applyProbe(json);
    router.refresh();
  }

  async function testGina() {
    if (!relaySecret.trim() && !appPassword.trim() && !apiKey.trim()) {
      setMessage("Enter RELAY_SECRET before testing.");
      return;
    }
    setPending(true);
    setMessage(null);
    setNextStep(null);
    const response = await fetch("/api/ats/gina/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseUrl,
        relaySecret: relaySecret || undefined,
        appPassword: appPassword || undefined,
        apiKey: apiKey || undefined,
      }),
    });
    const json = await response.json();
    setPending(false);
    applyProbe(json);
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-3">
      <label className="block text-sm">
        <span className="font-medium text-ink">Provider</span>
        <select
          className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
          value={provider}
          onChange={(event) => {
            const next = event.target.value as typeof provider;
            setProvider(next);
            const meta = providers.find((item) => item.id === next);
            if (meta) {
              setBaseUrl(meta.defaultBaseUrl);
              setDisplayName(`${meta.name}`);
            }
          }}
        >
          {providers.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="font-medium text-ink">Display name</span>
        <input
          className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          required
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-ink">Base URL</span>
        <input
          className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          required
        />
      </label>
      {(provider === "gina_ats" || provider === "claude_ats") && (
        <>
          <label className="block text-sm">
            <span className="font-medium text-ink">RELAY_SECRET (required for bots)</span>
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
              value={relaySecret}
              onChange={(event) => setRelaySecret(event.target.value)}
              placeholder="Same secret Gina bots used in Railway"
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">Browser app password (optional)</span>
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
              value={appPassword}
              onChange={(event) => setAppPassword(event.target.value)}
              placeholder="Only if you also use the Gina web login gate"
              autoComplete="current-password"
            />
          </label>
        </>
      )}
      <label className="block text-sm">
        <span className="font-medium text-ink">API key (optional)</span>
        <input
          className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder="Only if Railway has a separate API token"
        />
      </label>
      <p className="text-sm text-ink-soft">
        If the old RELAY_SECRET stopped working, set a <strong>new</strong> one in Railway Gina,
        redeploy Gina, update every bot, then paste it here and click Save.
      </p>
      <p className="text-xs text-ink-soft">
        SignalHire Gina client: <code className="text-ink">{clientVersion}</code>
        {relaySecret.trim() ? (
          <>
            {" "}
            · RELAY_SECRET length: <code className="text-ink">{relaySecret.trim().length}</code>
          </>
        ) : null}
      </p>
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Working..." : "Save connection"}
        </button>
        {(provider === "gina_ats" || provider === "claude_ats") && (
          <button type="button" className="btn btn-secondary" disabled={pending} onClick={testGina}>
            Test Gina
          </button>
        )}
      </div>
      {message ? <p className="text-sm font-medium text-ink">{message}</p> : null}
      {nextStep ? <p className="text-sm text-signal-deep">{nextStep}</p> : null}
      {probe?.probedRoutes?.length ? (
        <div className="rounded-xl border border-line bg-white px-3 py-3 text-xs text-ink-soft">
          <p className="font-semibold text-ink">Diagnostics</p>
          <p className="mt-1">
            strategy: {probe.authStrategy ?? "n/a"} · cookie:{" "}
            {probe.cookieReceived ? "yes" : "no"} · login: {probe.loginStatus ?? "n/a"}{" "}
            {probe.loginLocation ?? ""}
          </p>
          <ul className="mt-2 space-y-1">
            {probe.probedRoutes.slice(0, 6).map((route) => (
              <li key={route.path}>
                {route.path}: {route.status} {route.ok ? "OK" : "FAIL"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  );
}
