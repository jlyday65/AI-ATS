import { MariaConsole } from "@/components/maria-console";
import { resolveSignalHireRelaySecret } from "@/lib/maria/auth";
import { getDemoOrg, listJobs } from "@/lib/store";

export default function MariaPage() {
  const org = getDemoOrg();
  const jobs = listJobs(org.id);
  const relayConfigured = Boolean(resolveSignalHireRelaySecret());

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10">
      <p className="chip">Gina bot · Maria</p>
      <h1 className="display mt-3 text-4xl font-bold text-ink">Maria sourcing bridge</h1>
      <p className="mt-3 max-w-3xl text-ink-soft">
        Maria is Gina&apos;s sourcer. From Gina she calls{" "}
        <code className="text-ink">POST /api/maria/source</code> with{" "}
        <code className="text-ink">X-Relay-Secret</code>. This page runs the same flow
        locally so you can verify shortlists and Gina imports before wiring the bot.
      </p>

      <div className="mt-6 rounded-2xl border border-line bg-white/70 px-5 py-4 text-sm text-ink-soft">
        <p className="font-medium text-ink">Flow</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Maria asks SignalHire to source a role (multi-platform demo search).</li>
          <li>Top matches are pushed to Gina via <code>/ats/import-candidates</code>.</li>
          <li>In Gina ATS → Agent → Check for actions to import the shortlist.</li>
        </ol>
      </div>

      <MariaConsole jobs={jobs} relayConfigured={relayConfigured} />
    </div>
  );
}
