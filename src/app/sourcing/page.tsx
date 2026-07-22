import { SourcingConsole } from "@/components/sourcing-console";
import { CANDIDATE_PLATFORMS } from "@/lib/platforms/catalog";
import { getDemoOrg, listAtsConnections, listJobs } from "@/lib/store";

export default function SourcingPage() {
  const org = getDemoOrg();
  const jobs = listJobs(org.id);
  const connections = listAtsConnections(org.id);
  const platforms = CANDIDATE_PLATFORMS.filter((platform) => platform.status !== "planned");

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10">
      <p className="chip">AI agent</p>
      <h1 className="display mt-3 text-4xl font-bold text-ink">Multi-platform sourcing</h1>
      <p className="mt-3 max-w-3xl text-ink-soft">
        Select a requisition, choose platforms, and optionally push the top-ranked candidates into
        your Claude ATS connection.
      </p>
      <SourcingConsole jobs={jobs} connections={connections} platforms={platforms} />
    </div>
  );
}
