import { ResumeConsole } from "@/components/resume-console";
import { resolveSignalHireRelaySecret } from "@/lib/maria/auth";
import {
  getDemoOrg,
  listJobs,
  listResumeApplications,
} from "@/lib/store";

export default function ResumesPage() {
  const org = getDemoOrg();
  const jobs = listJobs(org.id);
  const recent = listResumeApplications(org.id);
  const relayConfigured = Boolean(resolveSignalHireRelaySecret());

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10">
      <p className="chip">Applications · ats-v16</p>
      <h1 className="display mt-3 text-4xl font-bold text-ink">Resume intake</h1>
      <p className="mt-3 max-w-3xl text-ink-soft">
        Drop a candidate PDF onto a posted job. SignalHire extracts text, matches
        it to the requisition, and queues the candidate with full{" "}
        <code className="text-ink">resumeText</code> in Gina for Maria to evaluate.
      </p>

      <div className="mt-6 rounded-2xl border border-line bg-white/70 px-5 py-4 text-sm text-ink-soft">
        <p className="font-medium text-ink">Flow</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Upload PDF or paste resume text and select the job.</li>
          <li>SignalHire extracts name/email/skills and scores fit.</li>
          <li>Push to Gina → Agent → Check for actions to import.</li>
          <li>Ask Maria to evaluate using the resume on the candidate record.</li>
        </ol>
      </div>

      <ResumeConsole
        jobs={jobs}
        recent={recent}
        relayConfigured={relayConfigured}
      />
    </div>
  );
}
