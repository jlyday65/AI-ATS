import { NextResponse } from "next/server";
import { z } from "zod";
import {
  fingerprintSecret,
  hasValidMariaRelay,
  readRelaySecretFromRequest,
  resolveSignalHireRelaySecret,
} from "@/lib/maria/auth";
import { archiveCandidatesToTalentPool } from "@/lib/talent-pool/service";
import { listTalentPool } from "@/lib/talent-pool/store";

const schema = z.object({
  jobTitle: z.string().min(1),
  jobDescription: z.string().optional(),
  location: z.string().optional(),
  clientName: z.string().optional(),
  label: z.string().optional(),
  candidates: z
    .array(
      z.object({
        fullName: z.string().optional(),
        name: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        headline: z.string().optional(),
        role: z.string().optional(),
        location: z.string().optional(),
        skills: z.array(z.string()).optional(),
        resumeText: z.string().optional(),
        resume: z.string().optional(),
        summary: z.string().optional(),
        source: z.string().optional(),
        stage: z.string().optional(),
      }),
    )
    .min(1),
});

export async function GET() {
  return NextResponse.json({
    endpoint: "POST /api/talent-pool/archive",
    auth: "X-Relay-Secret",
    poolSize: listTalentPool().length,
    note: "Gina Save/Export posts Board + Candidate File people here for Maria reuse.",
  });
}

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

  try {
    const result = archiveCandidatesToTalentPool(parsed.data);
    return NextResponse.json(
      {
        ok: true,
        archived: result.count,
        poolSize: listTalentPool().length,
        names: result.saved.map((c) => c.fullName),
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Talent pool archive failed",
      },
      { status: 400 },
    );
  }
}
