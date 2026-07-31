import { NextResponse } from "next/server";
import { z } from "zod";
import {
  fingerprintSecret,
  hasValidMariaRelay,
  readRelaySecretFromRequest,
  resolveSignalHireRelaySecret,
} from "@/lib/maria/auth";
import { talentMatchesForJob } from "@/lib/talent-pool/service";
import { createJob, getDemoOrg, listJobs } from "@/lib/store";

const schema = z.object({
  roleTitle: z.string().min(1),
  roleDescription: z.string().optional(),
  location: z.string().optional(),
  requiredSkills: z.array(z.string()).optional(),
  preferredSkills: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export async function POST(request: Request) {
  if (!resolveSignalHireRelaySecret()) {
    return NextResponse.json(
      { error: "RELAY_SECRET not configured on SignalHire" },
      { status: 503 },
    );
  }
  if (!hasValidMariaRelay(request)) {
    const provided = readRelaySecretFromRequest(request);
    return NextResponse.json(
      {
        error: "Not authenticated",
        hint: provided ? "relay_secret_mismatch" : "relay_secret_header_missing",
        serverFingerprint: fingerprintSecret(resolveSignalHireRelaySecret()),
      },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const org = getDemoOrg();
  const title = parsed.data.roleTitle.trim();
  const existing = listJobs(org.id).find(
    (j) => j.title.trim().toLowerCase() === title.toLowerCase(),
  );
  const job =
    existing ||
    createJob({
      orgId: org.id,
      title,
      department: "Sourcing",
      location: parsed.data.location || "Remote — US",
      employmentType: "full_time",
      description: parsed.data.roleDescription || `Role: ${title}`,
      requiredSkills: parsed.data.requiredSkills?.length
        ? parsed.data.requiredSkills
        : ["communication"],
      preferredSkills: parsed.data.preferredSkills || [],
      remote: (parsed.data.location || "").toLowerCase().includes("remote"),
    });

  const matches = talentMatchesForJob(job, parsed.data.limit ?? 12);
  return NextResponse.json({
    ok: true,
    job: { id: job.id, title: job.title },
    count: matches.length,
    matches: matches.map((m) => ({
      name: m.candidate.fullName,
      email: m.candidate.email,
      score: m.score,
      reasons: m.reasons,
      archivedFrom: m.candidate.archivedFromJobTitle,
      resumeChars: (m.candidate.resumeText || "").length,
    })),
  });
}
