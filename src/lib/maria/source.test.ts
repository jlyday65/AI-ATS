import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createJob, getDemoOrg, listJobs } from "@/lib/store";
import { resolveJob } from "@/lib/maria/source";

describe("resolveJob", () => {
  it("uses jobId when roleTitle matches or is omitted", () => {
    const org = getDemoOrg();
    const existing = listJobs(org.id)[0];
    assert.ok(existing);

    const byId = resolveJob({ jobId: existing.id });
    assert.equal(byId.id, existing.id);

    const byMatch = resolveJob({
      jobId: existing.id,
      roleTitle: existing.title,
    });
    assert.equal(byMatch.id, existing.id);
  });

  it("ignores mismatched jobId and sources the requested roleTitle", () => {
    const org = getDemoOrg();
    const stale = listJobs(org.id)[0];
    assert.ok(stale);

    // Simulate Gina sending the board's selected Senior/seed job while Kimberley
    // asked Maria to source Operations Manager.
    const job = resolveJob({
      jobId: stale.id,
      roleTitle: "Operations Manager",
      location: "Atlanta, GA",
    });

    assert.notEqual(job.id, stale.id);
    assert.equal(job.title, "Operations Manager");
    assert.equal(job.orgId, org.id);
  });

  it("reuses an existing job when roleTitle matches by title", () => {
    const org = getDemoOrg();
    const created = createJob({
      orgId: org.id,
      title: "Unique Role For Resolve Test",
      department: "Sourcing",
      location: "Remote — US",
      employmentType: "full_time",
      description: "test",
      requiredSkills: ["communication"],
      preferredSkills: [],
    });
    const stale = listJobs(org.id).find((j) => j.id !== created.id);
    assert.ok(stale);

    const job = resolveJob({
      jobId: stale.id,
      roleTitle: "Unique Role For Resolve Test",
    });
    assert.equal(job.id, created.id);
  });
});
