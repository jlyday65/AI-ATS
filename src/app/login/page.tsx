"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/dashboard";
  const reason = searchParams.get("reason");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const json = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) {
      setError(json.error || "Login failed");
      return;
    }
    router.replace(nextPath.startsWith("/") ? nextPath : "/dashboard");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-5 py-10">
      <p className="chip">Live mode</p>
      <h1 className="display mt-3 text-3xl font-bold text-ink">Re-enter password</h1>
      <p className="mt-2 text-sm text-ink-soft">
        SignalHire is in <strong className="text-ink">live</strong> mode. Enter the
        workspace password to continue
        {reason === "expired" ? " — your session timed out." : "."}
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <label className="block text-sm">
          <span className="font-medium text-ink">Password</span>
          <input
            type="password"
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <button type="submit" className="btn btn-primary w-full" disabled={pending}>
          {pending ? "Checking..." : "Unlock workspace"}
        </button>
        {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-10 text-ink-soft">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
