import { AtsConnectForm } from "@/components/ats-connect-form";
import { ATS_PROVIDERS } from "@/lib/ats/providers";
import { getDemoOrg, listAtsConnections } from "@/lib/store";

export default function AtsPage() {
  const org = getDemoOrg();
  const connections = listAtsConnections(org.id);

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10">
      <p className="chip">Integrations</p>
      <h1 className="display mt-3 text-4xl font-bold text-ink">Connect your ATS</h1>
      <p className="mt-3 max-w-3xl text-ink-soft">
        SignalHire is designed to sit on top of the ATS you already run — especially your custom
        Claude-built ATS — while also supporting major market systems.
      </p>

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
                  </div>
                  <span className="chip capitalize">{connection.status}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel rounded-2xl p-6">
          <h2 className="display text-2xl font-bold">Add connection</h2>
          <AtsConnectForm providers={ATS_PROVIDERS} />
        </section>
      </div>

      <section className="panel mt-8 rounded-2xl p-6">
        <h2 className="display text-2xl font-bold">Claude ATS contract</h2>
        <p className="mt-2 text-ink-soft">
          Your Claude ATS should expose <code className="text-ink">POST /candidates/import</code>{" "}
          and accept Bearer auth. SignalHire sends normalized candidate payloads with skills,
          profile URLs, and source tags.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-ink px-4 py-4 text-sm text-mist">
{`POST {baseUrl}/candidates/import
Authorization: Bearer <api_key>
Content-Type: application/json

{
  "source": "ai-ats",
  "jobExternalId": "claude_req_1001",
  "candidates": [{ "fullName": "...", "email": "...", "skills": [] }]
}`}
        </pre>
      </section>
    </div>
  );
}
