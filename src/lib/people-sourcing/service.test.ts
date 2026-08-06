import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  peopleProviderStatus,
  searchPeopleProviders,
} from "@/lib/people-sourcing/service";
import type { JobRequisition } from "@/lib/types";

const job: JobRequisition = {
  id: "job_people_test",
  orgId: "org_test",
  title: "Warehouse Mechanic",
  department: "Ops",
  location: "Atlanta, GA",
  employmentType: "full_time",
  description: "Maintain equipment",
  requiredSkills: ["hydraulics", "preventive maintenance"],
  preferredSkills: ["welding"],
  status: "open",
  createdAt: new Date().toISOString(),
};

describe("searchPeopleProviders", () => {
  it("falls back to demo candidates without API keys", async () => {
    const report = await searchPeopleProviders({
      job,
      forceDemo: true,
      limit: 10,
      platforms: ["linkedin", "indeed", "ziprecruiter"],
    });
    assert.equal(report.mode, "demo");
    assert.ok(report.candidates.length >= 3);
    assert.ok(report.candidates.every((c) => c.fullName));
    assert.ok(report.candidates.some((c) => (c.resumeText || "").length > 40));
  });

  it("exposes provider status", () => {
    const status = peopleProviderStatus();
    assert.equal(status.demoFallback, true);
  });
});
