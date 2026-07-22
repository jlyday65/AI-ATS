"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AtsProviderMeta } from "@/lib/ats/providers";

export function AtsConnectForm({ providers }: { providers: AtsProviderMeta[] }) {
  const router = useRouter();
  const [provider, setProvider] = useState(providers[0]?.id ?? "claude_ats");
  const selected = providers.find((item) => item.id === provider) ?? providers[0];
  const [displayName, setDisplayName] = useState("Claude ATS Production");
  const [baseUrl, setBaseUrl] = useState(selected?.defaultBaseUrl ?? "");
  const [apiKey, setApiKey] = useState("demo-key");
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
        apiKey,
        syncDirection: selected?.supportsBidirectional ? "bidirectional" : "push",
        demoMode: true,
      }),
    });
    const json = await response.json();
    setPending(false);
    if (!response.ok) {
      setMessage("Could not save ATS connection.");
      return;
    }
    setMessage(`Connected ${json.connection.displayName}`);
    router.refresh();
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
              setDisplayName(`${meta.name} Production`);
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
      <label className="block text-sm">
        <span className="font-medium text-ink">API key</span>
        <input
          className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
        />
      </label>
      <p className="text-sm text-ink-soft">{selected?.description}</p>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving..." : "Save connection"}
      </button>
      {message ? <p className="text-sm font-medium text-signal-deep">{message}</p> : null}
    </form>
  );
}
