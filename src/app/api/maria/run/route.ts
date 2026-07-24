import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveSignalHireRelaySecret } from "@/lib/maria/auth";
import { runMariaSourcing } from "@/lib/maria/source";

/**
 * Browser / SignalHire UI entry for Maria-style sourcing.
 * Uses the saved RELAY_SECRET from store — no secret in the browser.
 * Gina's Maria bot should call POST /api/maria/source with X-Relay-Secret instead.
 */
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
  pushToGina: z.boolean().optional(),
  pushTopN: z.number().int().min(1).max(50).optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.pushToGina !== false && !resolveSignalHireRelaySecret()) {
    return NextResponse.json(
      {
        error: "Save RELAY_SECRET on /ats before Maria can push to Gina.",
        hint: "relay_secret_not_configured_on_signalhire",
      },
      { status: 503 },
    );
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
