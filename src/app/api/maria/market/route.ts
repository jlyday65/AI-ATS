import { NextResponse } from "next/server";
import { z } from "zod";
import {
  fingerprintSecret,
  hasValidMariaRelay,
  readRelaySecretFromRequest,
  resolveSignalHireRelaySecret,
} from "@/lib/maria/auth";
import { runMariaMarketResearch } from "@/lib/maria/market";
import { jobsMarketProviderStatus } from "@/lib/jobs-market/service";

const schema = z.object({
  roleTitle: z.string().min(1),
  location: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(40).optional(),
  providers: z.array(z.enum(["coresignal", "brightdata", "demo"])).optional(),
  forceDemo: z.boolean().optional(),
});

export async function GET() {
  const expected = resolveSignalHireRelaySecret();
  return NextResponse.json({
    agent: "maria",
    endpoint: "POST /api/maria/market",
    auth: "X-Relay-Secret (same value as Gina RELAY_SECRET)",
    relayConfigured: Boolean(expected),
    relayFingerprint: fingerprintSecret(expected),
    providers: jobsMarketProviderStatus(),
    note: "Job market intel via Coresignal Multi-source Jobs + Bright Data Jobs. Not candidate/people search — use /api/maria/source for that.",
    body: {
      roleTitle: "Operations Manager",
      location: "Atlanta, GA",
      keywords: ["warehouse", "logistics"],
      limit: 12,
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
    const result = await runMariaMarketResearch(parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Maria market research failed",
      },
      { status: 400 },
    );
  }
}
