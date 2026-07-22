import { NextResponse } from "next/server";
import { z } from "zod";
import { createJob, getDemoOrg, listJobs } from "@/lib/store";

const createJobSchema = z.object({
  title: z.string().min(2),
  department: z.string().optional(),
  location: z.string().optional(),
  employmentType: z.enum(["full_time", "contract", "part_time", "internship"]).default("full_time"),
  description: z.string().min(10),
  requiredSkills: z.array(z.string()).default([]),
  preferredSkills: z.array(z.string()).default([]),
  seniority: z.string().optional(),
  remote: z.boolean().optional(),
  atsExternalId: z.string().optional(),
});

export async function GET() {
  const org = getDemoOrg();
  return NextResponse.json({ jobs: listJobs(org.id) });
}

export async function POST(request: Request) {
  const org = getDemoOrg();
  const body = await request.json();
  const parsed = createJobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const job = createJob({
    orgId: org.id,
    ...parsed.data,
  });

  return NextResponse.json({ job }, { status: 201 });
}
