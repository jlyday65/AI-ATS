import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  jobsMarketProviderStatus,
  researchJobsMarket,
} from "@/lib/jobs-market/service";

describe("researchJobsMarket", () => {
  it("returns demo postings and insights without API keys", async () => {
    const report = await researchJobsMarket({
      roleTitle: "Operations Manager",
      location: "Atlanta, GA",
      forceDemo: true,
      limit: 8,
    });

    assert.equal(report.mode, "demo");
    assert.ok(report.postings.length >= 4);
    assert.ok(report.insights.summary.includes("Operations Manager"));
    assert.ok(report.insights.competingEmployers.length >= 1);
    assert.equal(report.query.roleTitle, "Operations Manager");
  });

  it("requires roleTitle", async () => {
    await assert.rejects(
      () => researchJobsMarket({ roleTitle: "  " }),
      /roleTitle/i,
    );
  });

  it("exposes provider configuration status", () => {
    const status = jobsMarketProviderStatus();
    assert.equal(status.demoFallback, true);
    assert.ok(
      status.coresignal === "configured" ||
        status.coresignal === "missing_api_key",
    );
  });
});
