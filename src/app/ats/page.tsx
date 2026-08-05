import { AtsConnectForm } from "@/components/ats-connect-form";
import { AtsModeSettings } from "@/components/ats-mode-settings";
import {
  fingerprintSecret,
  GINA_CLIENT_VERSION,
  GINA_DEFAULT_BASE_URL,
} from "@/lib/ats/gina-client";
import { ATS_PROVIDERS } from "@/lib/ats/providers";
import { resolveAppPassword } from "@/lib/auth/session";
import { getAppSettings, getDemoOrg, listAtsConnections } from "@/lib/store";

export default function AtsPage() {
  const org = getDemoOrg();
  const connections = listAtsConnections(org.id);
  const settings = getAppSettings();

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10">
      <p className="chip">Integrations · {GINA_CLIENT_VERSION}</p>
      <h1 className="display mt-3 text-4xl font-bold text-ink">Connect your ATS</h1>
      <p className="mt-3 max-w-3xl text-ink-soft">
        SignalHire syncs into{" "}
        <span className="font-semibold text-ink">Gina</span>, the Lyday Talent Partners ATS at{" "}
        <code className="text-ink">{GINA_DEFAULT_BASE_URL.replace("https://", "")}</code>.
        Client build: <code className="text-ink">{GINA_CLIENT_VERSION}</code>.
      </p>

      <section className="panel mt-8 rounded-2xl p-6">
        <h2 className="display text-2xl font-bold">ATS mode</h2>
        <p className="mt-2 text-ink-soft">
          Current mode:{" "}
          <span className="font-semibold capitalize text-ink">{settings.atsMode}</span>
          {settings.atsMode === "live"
            ? settings.sessionTimeoutMinutes === 0
              ? " · no password gate (seamless)"
              : ` · re-enter password after ${settings.sessionTimeoutMinutes} min idle`
            : " · demo tags, no password gate"}
          .
        </p>
        <AtsModeSettings
          initialMode={settings.atsMode}
          initialTimeout={settings.sessionTimeoutMinutes}
          livePasswordConfigured={Boolean(resolveAppPassword())}
        />
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="panel rounded-2xl p-6">
          <h2 className="display text-2xl font-bold">Active connections</h2>
          <ul className="mt-4 space-y-3">
            {connections.map((connection) => (
              <li key={connection.id} className="rounded-xl border border-line bg-white px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{connection.displayName}</p>
                    <p className="text-sm text-ink-soft">
                      {connection.provider} · {connection.syncDirection}
                    </p>
                    <p className="mt-1 break-all text-xs text-ink-soft">{connection.baseUrl}</p>
                    <p className="mt-1 text-xs text-ink-soft">
                      relay fingerprint:{" "}
                      <code className="text-ink">
                        {fingerprintSecret(connection.config.relaySecret)}
                      </code>
                    </p>
                  </div>
                  <span className="chip capitalize">{connection.status}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel rounded-2xl p-6">
          <h2 className="display text-2xl font-bold">Add connection</h2>
          <AtsConnectForm
            providers={ATS_PROVIDERS}
            clientVersion={GINA_CLIENT_VERSION}
            initialRelaySecret={connections[0]?.config.relaySecret || ""}
            initialBaseUrl={connections[0]?.baseUrl}
            initialDisplayName={connections[0]?.displayName}
          />
        </section>
      </div>

      <section className="panel mt-8 rounded-2xl p-6">
        <h2 className="display text-2xl font-bold">Gina bot auth (RELAY_SECRET)</h2>
        <p className="mt-2 text-ink-soft">
          After you click <strong>Save connection</strong>, SignalHire keeps the secret in{" "}
          <code className="text-ink">.data/ai-ats-store.json</code> so you do not re-type it every
          restart. You can also lock it in <code className="text-ink">.env.local</code> (see below).
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-ink px-4 py-4 text-sm text-mist">
{`# Option A — Save once on /ats (persists in .data/)

# Option B — lock into env (survives store resets):
# create ~/AI-ATS/.env.local with:
RELAY_SECRET=<same-value-as-Railway>
GINA_ATS_BASE_URL=${GINA_DEFAULT_BASE_URL}
ATS_MODE=test
SIGNALHIRE_APP_PASSWORD=<for-live-mode-only>

# Railway → Gina production → Variables must match
RELAY_SECRET=<same-value>
# then Redeploy Gina if you change it`}
        </pre>
      </section>
    </div>
  );
}
