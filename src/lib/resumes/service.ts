import { randomUUID } from "crypto";
import { rankCandidates } from "@/lib/ai/matcher";
import { pushCandidatesToAts } from "@/lib/ats/providers";
import {
  addSyncEvent,
  createJob,
  getDemoOrg,
  getJob,
  listAtsConnections,
  listJobs,
  saveResumeApplication,
} from "@/lib/store";
import type { CandidateProfile, JobRequisition, ResumeApplication } from "@/lib/types";
import { extractFromPdfBuffer, extractFromResumeText } from "@/lib/resumes/extract";

export interface ResumeIntakeInput {
  jobId?: string;
  roleTitle?: string;
  fileName?: string;
  /** Raw PDF bytes */
  pdfBuffer?: Buffer;
  /** Pasted resume text (alternative to PDF) */
  resumeText?: string;
  /** Override parsed name */
  candidateName?: string;
  candidateEmail?: string;
  pushToGina?: boolean;
}

function resolveJob(input: ResumeIntakeInput): JobRequisition {
  const org = getDemoOrg();
  if (input.jobId) {
    const job = getJob(input.jobId);
    if (!job || job.orgId !== org.id) throw new Error(`Unknown jobId: ${input.jobId}`);
    return job;
  }

  const title = (input.roleTitle || "").trim();
  if (!title) throw new Error("Provide jobId or roleTitle");

  const match = listJobs(org.id).find(
    (job) => job.title.trim().toLowerCase() === title.toLowerCase(),
  );
  if (match) return match;

  return createJob({
    orgId: org.id,
    title,
    department: "Applications",
    location: "TBD",
    employmentType: "full_time",
    description: `Inbound resume applications for ${title}.`,
    requiredSkills: ["operations"],
    preferredSkills: [],
  });
}

function toCandidate(
  extracted: Awaited<ReturnType<typeof extractFromResumeText>>,
  overrides: { name?: string; email?: string },
): CandidateProfile {
  return {
    id: `cand_${randomUUID().slice(0, 8)}`,
    fullName: overrides.name?.trim() || extracted.fullName,
    email: overrides.email?.trim() || extracted.email,
    phone: extracted.phone,
    location: extracted.location,
    headline: extracted.headline,
    skills: extracted.skills,
    experienceYears: extracted.experienceYears,
    platforms: [],
    summary: extracted.resumeText.slice(0, 600),
    resumeText: extracted.resumeText,
    sourceSignals: ["resume_upload"],
  };
}

export async function intakeResume(input: ResumeIntakeInput) {
  const org = getDemoOrg();
  const job = resolveJob(input);

  const extracted = input.pdfBuffer?.length
    ? await extractFromPdfBuffer(input.pdfBuffer, input.fileName || "resume.pdf")
    : extractFromResumeText(input.resumeText || "");

  const candidate = toCandidate(extracted, {
    name: input.candidateName,
    email: input.candidateEmail,
  });

  const [match] = rankCandidates(job, [candidate]);
  const pushToGina = input.pushToGina !== false;
  const gina = listAtsConnections(org.id).find(
    (item) =>
      item.provider === "gina_ats" || item.baseUrl.includes("lyday-gina-backend"),
  );

  let atsSync: { ok: boolean; message: string } | undefined;
  if (pushToGina) {
    if (!gina?.config.relaySecret) {
      throw new Error("Gina ATS connection has no RELAY_SECRET. Save it on /ats first.");
    }
    const result = await pushCandidatesToAts({
      connection: gina,
      job,
      candidates: [candidate],
    });
    atsSync = { ok: result.ok, message: result.message };
    addSyncEvent({
      orgId: org.id,
      atsConnectionId: gina.id,
      direction: "push",
      entityType: "application",
      payloadSummary: `Resume for ${candidate.fullName} → ${job.title}`,
      status: result.ok ? "success" : "failed",
    });
  }

  const application: ResumeApplication = {
    id: `app_${randomUUID().slice(0, 8)}`,
    orgId: org.id,
    jobId: job.id,
    fileName: input.fileName || (input.pdfBuffer ? "resume.pdf" : "pasted-resume.txt"),
    candidateName: candidate.fullName,
    candidateEmail: candidate.email,
    candidatePhone: candidate.phone,
    resumeText: candidate.resumeText || "",
    extractedSkills: candidate.skills,
    matchScore: match?.score ?? 0,
    matchReasons: match?.reasons ?? [],
    pushToGina,
    atsSync,
    createdAt: new Date().toISOString(),
  };

  saveResumeApplication(application);

  return {
    application,
    job: { id: job.id, title: job.title },
    candidate: {
      id: candidate.id,
      name: candidate.fullName,
      email: candidate.email,
      phone: candidate.phone,
      headline: candidate.headline,
      skills: candidate.skills,
      experienceYears: candidate.experienceYears,
      resumeChars: (candidate.resumeText || "").length,
    },
    match: {
      score: application.matchScore,
      reasons: application.matchReasons,
    },
    atsSync,
    nextStep: atsSync?.ok
      ? "In Gina ATS → Agent → Check for actions to import the candidate + resume text. Then Maria can evaluate using that resume."
      : pushToGina
        ? "Review atsSync message; fix Gina RELAY_SECRET if push failed."
        : "Resume stored in SignalHire. Enable push to Gina to queue import_candidate.",
  };
}
