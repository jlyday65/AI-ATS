import { NextResponse } from "next/server";
import { z } from "zod";
import {
  fingerprintSecret,
  hasValidMariaRelay,
  readRelaySecretFromRequest,
  resolveSignalHireRelaySecret,
} from "@/lib/maria/auth";
import { runMariaSourcing } from "@/lib/maria/source";

const schema = z.object({
  jobId: z.string().optional(),
  roleTitle: z.string().optional(),
  roleDescription: z.string().optional(),
  requiredSkills: z.array(z.string()).optional(),
  preferredSkills: z.array(z.string()).optional(),
  location: z.string().optional(),
  seniority: z.string().optional(),
  platformIds: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  resumesRequired: z.boolean().optional(),
  pushToGina: z.boolean().optional(),
  pushTopN: z.number().int().min(1).max(50).optional(),
});

export async function GET() {
  const expected = resolveSignalHireRelaySecret();
  return NextResponse.json({
    agent: "maria",
    endpoint: "POST /api/maria/source",
    auth: "X-Relay-Secret (same value as Gina RELAY_SECRET)",
    relayConfigured: Boolean(expected),
    relayFingerprint: fingerprintSecret(expected),
    body: {
      roleTitle: "Warehouse Mechanic",
      location: "Atlanta, GA",
      roleDescription: "All candidates must have a resume on file.",
      resumesRequired: true,
      requiredSkills: ["hydraulics", "preventive maintenance"],
      pushToGina: true,
      pushTopN: 5,
    },
  });
}

export async function POST(request: Request) {
  if (!resolveSignalHireRelaySecret()) {
    return NextResponse.json(
      {
        error: "SignalHire has no RELAY_SECRET saved. Save it on /ats first.",
        hint: "relay_secret_not_configured_on_signalhire",
      },
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
        clientFingerprint: fingerprintSecret(provided),
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
    const result = await runMariaSourcing(parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Maria sourcing failed" },
      { status: 400 },
    );
  }
}
