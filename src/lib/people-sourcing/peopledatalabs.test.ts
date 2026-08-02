import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { searchPeopleDataLabs } from "@/lib/people-sourcing/peopledatalabs";
import type { JobRequisition } from "@/lib/types";

const job: JobRequisition = {
  id: "job_pdl_test",
  orgId: "org_test",
  title: "Operations Manager",
  location: "Atlanta, GA",
  employmentType: "full_time",
  description: "Lead warehouse operations",
  requiredSkills: ["operations", "leadership"],
  preferredSkills: [],
  status: "open",
  createdAt: new Date().toISOString(),
};

describe("searchPeopleDataLabs", () => {
  it("skips when API key is missing", async () => {
    const prev = process.env.PEOPLEDATALABS_API_KEY;
    const prevAlt = process.env.PDL_API_KEY;
    delete process.env.PEOPLEDATALABS_API_KEY;
    delete process.env.PDL_API_KEY;
    delete process.env.PEOPLE_DATA_LABS_API_KEY;

    const result = await searchPeopleDataLabs({ job, limit: 5 });
    assert.equal(result.provider, "peopledatalabs");
    assert.equal(result.mode, "skipped");
    assert.equal(result.candidates.length, 0);

    if (prev != null) process.env.PEOPLEDATALABS_API_KEY = prev;
    if (prevAlt != null) process.env.PDL_API_KEY = prevAlt;
  });
});
