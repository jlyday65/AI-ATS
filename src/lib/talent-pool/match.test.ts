import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchTalentPool } from "@/lib/talent-pool/match";
import type { TalentPoolCandidate } from "@/lib/talent-pool/types";
import type { JobRequisition } from "@/lib/types";

const job: JobRequisition = {
  id: "job_tp",
  orgId: "org",
  title: "Warehouse Mechanic",
  location: "Atlanta, GA",
  employmentType: "full_time",
  description:
    "Maintain hydraulics, welding support, preventive maintenance for warehouse equipment.",
  requiredSkills: ["hydraulics", "preventive maintenance"],
  preferredSkills: ["welding"],
  status: "open",
  createdAt: new Date().toISOString(),
};

describe("matchTalentPool", () => {
  it("ranks archived candidates whose resume matches the new JD", () => {
    const pool: TalentPoolCandidate[] = [
      {
        id: "tp1",
        fullName: "Alex Mechanic",
        location: "Atlanta, GA",
        skills: ["hydraulics"],
        resumeText:
          "Warehouse Mechanic with hydraulics and preventive maintenance. Welding certified.",
        archivedFromJobTitle: "Warehouse Mechanic",
        archivedAt: new Date().toISOString(),
      },
      {
        id: "tp2",
        fullName: "Sam Accountant",
        location: "Boston, MA",
        skills: ["excel", "gaap"],
        resumeText: "Staff accountant focused on month-end close.",
        archivedFromJobTitle: "Staff Accountant",
        archivedAt: new Date().toISOString(),
      },
    ];

    const matches = matchTalentPool(job, pool, { limit: 5, minScore: 28 });
    assert.ok(matches.length >= 1);
    assert.equal(matches[0].candidate.fullName, "Alex Mechanic");
    assert.ok(matches[0].score >= 28);
    assert.ok(!matches.some((m) => m.candidate.fullName === "Sam Accountant"));
  });
});
