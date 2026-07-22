"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AtsProviderMeta } from "@/lib/ats/providers";

export function AtsConnectForm({ providers }: { providers: AtsProviderMeta[] }) {
  const router = useRouter();
  const defaultProvider = providers.find((item) => item.id === "gina_ats") ?? providers[0];
  const [provider, setProvider] = useState(defaultProvider?.id ?? "gina_ats");
  const selected = providers.find((item) => item.id === provider) ?? defaultProvider;
  const [displayName, setDisplayName] = useState("Gina ATS Production");
  const [baseUrl, setBaseUrl] = useState(
    selected?.defaultBaseUrl ?? "https://lyday-gina-backend-production.up.railway.app",
  );
  const [apiKey, setApiKey] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const response = await fetch("/api/ats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        displayName,
        baseUrl,
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
    setMessage(json.probe?.message ?? `Connected ${json.connection.displayName}`);
    router.refresh();
  }

  async function testGina() {
    setPending(true);
    setMessage(null);
    const response = await fetch("/api/ats/gina/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseUrl,
        appPassword: appPassword || undefined,
        apiKey: apiKey || undefined,
      }),
    });
    const json = await response.json();
    setPending(false);
    setMessage(json.message ?? "Test complete");
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
        <label className="block text-sm">
          <span className="font-medium text-ink">Gina app password</span>
          <input
            type="password"
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
            value={appPassword}
            onChange={(event) => setAppPassword(event.target.value)}
            placeholder="Password used on the Gina sign-in gate"
          />
        </label>
      )}
      <label className="block text-sm">
        <span className="font-medium text-ink">API key (optional)</span>
        <input
          className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
        />
      </label>
      <p className="text-sm text-ink-soft">{selected?.description}</p>
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving..." : "Save connection"}
        </button>
        {(provider === "gina_ats" || provider === "claude_ats") && (
          <button type="button" className="btn btn-secondary" disabled={pending} onClick={testGina}>
            Test Gina
          </button>
        )}
      </div>
      {message ? <p className="text-sm font-medium text-signal-deep">{message}</p> : null}
    </form>
  );
}
