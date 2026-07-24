import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildHeadline, searchCandidatePlatforms } from "@/lib/platforms/connector";
import type { JobRequisition } from "@/lib/types";

const job: JobRequisition = {
  id: "job_test",
  orgId: "org_test",
  title: "Senior Full-Stack Engineer",
  department: "Engineering",
  location: "Remote — US",
  employmentType: "full_time",
  description: "Build products",
  requiredSkills: ["TypeScript", "React", "Node.js"],
  preferredSkills: ["Next.js"],
  seniority: "Senior",
  remote: true,
  status: "open",
  createdAt: new Date().toISOString(),
};

describe("platform connector demo search", () => {
  it("does not double seniority in headlines", () => {
    assert.equal(
      buildHeadline(job, ["TypeScript", "PostgreSQL"]),
      "Senior Full-Stack Engineer · TypeScript / PostgreSQL",
    );
  });

  it("returns unique people (no repeated full names or emails)", async () => {
    const candidates = await searchCandidatePlatforms({
      job,
      platforms: ["linkedin", "github", "stackoverflow", "devto", "kaggle"],
      limit: 20,
    });
    const names = candidates.map((c) => c.fullName);
    const emails = candidates.map((c) => c.email);
    assert.equal(names.length, new Set(names).size);
    assert.equal(emails.length, new Set(emails).size);
    assert.ok(candidates.length >= 10);
  });

  it("can attach multiple platforms to one person", async () => {
    const candidates = await searchCandidatePlatforms({
      job,
      platforms: ["linkedin", "github", "stackoverflow", "devto"],
      limit: 12,
    });
    assert.ok(candidates.some((c) => c.platforms.length > 1));
  });
});
