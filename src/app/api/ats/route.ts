import { NextResponse } from "next/server";
import { z } from "zod";
import { ATS_PROVIDERS } from "@/lib/ats/providers";
import { getDemoOrg, listAtsConnections, upsertAtsConnection } from "@/lib/store";

const connectSchema = z.object({
  provider: z.enum([
    "claude_ats",
    "greenhouse",
    "lever",
    "workday",
    "icims",
    "bullhorn",
    "custom_webhook",
  ]),
  displayName: z.string().min(2),
  baseUrl: z.string().url(),
  apiKey: z.string().optional(),
  syncDirection: z.enum(["push", "pull", "bidirectional"]).default("bidirectional"),
  demoMode: z.boolean().optional(),
});

export async function GET() {
  const org = getDemoOrg();
  return NextResponse.json({
    providers: ATS_PROVIDERS,
    connections: listAtsConnections(org.id),
  });
}

export async function POST(request: Request) {
  const org = getDemoOrg();
  const body = await request.json();
  const parsed = connectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const connection = upsertAtsConnection({
    orgId: org.id,
    provider: parsed.data.provider,
    displayName: parsed.data.displayName,
    baseUrl: parsed.data.baseUrl,
    syncDirection: parsed.data.syncDirection,
    apiKeyConfigured: Boolean(parsed.data.apiKey),
    config: {
      apiKey: parsed.data.apiKey ?? "",
      demoMode: parsed.data.demoMode ? "true" : "false",
    },
  });

  return NextResponse.json({ connection }, { status: 201 });
}
