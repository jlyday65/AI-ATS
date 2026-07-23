import { NextResponse } from "next/server";
import { z } from "zod";
import {
  fingerprintSecret,
  GINA_DEFAULT_BASE_URL,
  testGinaConnection,
} from "@/lib/ats/gina-client";

const schema = z.object({
  baseUrl: z.string().url().optional(),
  appPassword: z.string().optional(),
  apiKey: z.string().optional(),
  relaySecret: z.string().optional(),
});

export async function GET() {
  const result = await testGinaConnection({
    baseUrl: GINA_DEFAULT_BASE_URL,
    appPassword: process.env.GINA_ATS_APP_PASSWORD,
    apiKey: process.env.GINA_ATS_API_KEY,
    relaySecret: process.env.RELAY_SECRET || process.env.GINA_RELAY_SECRET,
  });
  return NextResponse.json(result, { status: result.healthOk ? 200 : 503 });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const relaySecret = (
    parsed.data.relaySecret ||
    process.env.RELAY_SECRET ||
    process.env.GINA_RELAY_SECRET ||
    ""
  ).trim();

  const result = await testGinaConnection({
    baseUrl: parsed.data.baseUrl || GINA_DEFAULT_BASE_URL,
    appPassword: parsed.data.appPassword || process.env.GINA_ATS_APP_PASSWORD,
    apiKey: parsed.data.apiKey || process.env.GINA_ATS_API_KEY,
    relaySecret,
  });

  return NextResponse.json(
    {
      ...result,
      relayFingerprint: fingerprintSecret(relaySecret),
    },
    { status: result.healthOk ? 200 : 503 },
  );
}
