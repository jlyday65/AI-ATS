import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rankCandidates } from "@/lib/ai/matcher";
import type { CandidateProfile, JobRequisition } from "@/lib/types";

describe("rankCandidates", () => {
  it("scores required skill overlap higher", () => {
    const job: JobRequisition = {
      id: "job_1",
      orgId: "org_1",
      title: "Engineer",
      employmentType: "full_time",
      description: "Build products",
      requiredSkills: ["TypeScript", "React"],
      preferredSkills: ["Next.js"],
      status: "open",
      createdAt: new Date().toISOString(),
    };

    const strong: CandidateProfile = {
      id: "c1",
      fullName: "Strong Fit",
      skills: ["TypeScript", "React", "Next.js"],
      platforms: [{ platformId: "github", profileUrl: "https://github.com/strong" }],
      sourceSignals: [],
      experienceYears: 6,
      location: "Remote — US",
    };

    const weak: CandidateProfile = {
      id: "c2",
      fullName: "Weak Fit",
      skills: ["Java"],
      platforms: [{ platformId: "linkedin", profileUrl: "https://linkedin.com/in/weak" }],
      sourceSignals: [],
      experienceYears: 2,
    };

    const ranked = rankCandidates(job, [weak, strong]);
    assert.equal(ranked[0].candidate.id, "c1");
    assert.ok(ranked[0].score > ranked[1].score);
  });
});
