import { NextResponse } from "next/server";
import { CANDIDATE_PLATFORMS } from "@/lib/platforms/catalog";
import { getPlatformCoverageSummary } from "@/lib/platforms/connector";

export async function GET() {
  return NextResponse.json({
    summary: getPlatformCoverageSummary(),
    platforms: CANDIDATE_PLATFORMS,
  });
}
