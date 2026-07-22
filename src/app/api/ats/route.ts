import { NextResponse } from "next/server";
import { z } from "zod";
import { ATS_PROVIDERS, probeAtsConnection } from "@/lib/ats/providers";
import { getDemoOrg, getAtsConnection, listAtsConnections, upsertAtsConnection } from "@/lib/store";

const connectSchema = z.object({
  provider: z.enum([
    "gina_ats",
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
  appPassword: z.string().optional(),
  relaySecret: z.string().optional(),
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
    apiKeyConfigured: Boolean(
      parsed.data.apiKey || parsed.data.appPassword || parsed.data.relaySecret,
    ),
    config: {
      apiKey: parsed.data.apiKey ?? "",
      appPassword: parsed.data.appPassword ?? "",
      relaySecret: parsed.data.relaySecret ?? "",
      demoMode: parsed.data.demoMode ? "true" : "false",
    },
  });

  const probe = await probeAtsConnection(connection);
  connection.status = probe.ok ? "connected" : "error";
  connection.lastSyncAt = probe.ok ? new Date().toISOString() : connection.lastSyncAt;

  return NextResponse.json({ connection, probe }, { status: 201 });
}

export async function PUT(request: Request) {
  const org = getDemoOrg();
  const body = (await request.json()) as { connectionId?: string };
  if (!body.connectionId) {
    return NextResponse.json({ error: "connectionId required" }, { status: 400 });
  }

  const connection = getAtsConnection(body.connectionId);
  if (!connection || connection.orgId !== org.id) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  const probe = await probeAtsConnection(connection);
  connection.status = probe.ok ? "connected" : "error";
  if (probe.ok) {
    connection.lastSyncAt = new Date().toISOString();
  }

  return NextResponse.json({ connection, probe });
}
