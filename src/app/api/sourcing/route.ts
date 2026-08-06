import { NextResponse } from "next/server";
import { z } from "zod";
import { runSourcingAgent } from "@/lib/sourcing/service";
import { getDemoOrg, listSourcingRuns } from "@/lib/store";

const sourcingSchema = z.object({
  jobId: z.string().min(1),
  platformIds: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  pushToAtsConnectionId: z.string().optional(),
  pushTopN: z.number().int().min(1).max(50).optional(),
});

export async function GET() {
  const org = getDemoOrg();
  return NextResponse.json({ runs: listSourcingRuns(org.id) });
}

export async function POST(request: Request) {
  const org = getDemoOrg();
  const body = await request.json();
  const parsed = sourcingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await runSourcingAgent({
      orgId: org.id,
      ...parsed.data,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sourcing failed" },
      { status: 400 },
    );
  }
}
