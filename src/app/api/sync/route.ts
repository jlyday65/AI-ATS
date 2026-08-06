import { NextResponse } from "next/server";
import { getDemoOrg, listSyncEvents } from "@/lib/store";

export async function GET() {
  const org = getDemoOrg();
  return NextResponse.json({ events: listSyncEvents(org.id) });
}
