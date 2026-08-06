import { NextResponse } from "next/server";
import { getDemoOrg, listMembers } from "@/lib/store";

export async function GET() {
  const org = getDemoOrg();
  return NextResponse.json({
    organization: org,
    members: listMembers(org.id),
  });
}
