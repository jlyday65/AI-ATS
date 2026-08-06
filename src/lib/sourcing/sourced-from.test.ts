import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  platformLabel,
  sourcedFromForCandidate,
  sourcedFromLine,
} from "@/lib/sourcing/sourced-from";
import type { CandidateProfile } from "@/lib/types";

const base: CandidateProfile = {
  id: "c1",
  fullName: "Ava Chen",
  skills: [],
  platforms: [],
  sourceSignals: [],
};

describe("sourced-from", () => {
  it("labels known providers", () => {
    assert.equal(platformLabel("peopledatalabs"), "People Data Labs");
    assert.equal(platformLabel("coresignal"), "Coresignal");
  });

  it("builds sourcedFrom from platforms + signals", () => {
    const labels = sourcedFromForCandidate(
      {
        ...base,
        platforms: [
          { platformId: "peopledatalabs", profileUrl: "https://example.com/p" },
          { platformId: "linkedin", profileUrl: "https://linkedin.com/in/x" },
        ],
        sourceSignals: ["People Data Labs Person Search"],
      },
      ["peopledatalabs"],
    );
    assert.ok(labels.includes("People Data Labs"));
    assert.ok(labels.includes("LinkedIn"));
    assert.match(sourcedFromLine(labels), /People Data Labs/);
  });

  it("infers Coresignal from sourceSignals when platform is LinkedIn only", () => {
    const labels = sourcedFromForCandidate({
      ...base,
      platforms: [
        { platformId: "linkedin", profileUrl: "https://linkedin.com/in/y" },
      ],
      sourceSignals: ["Coresignal Multi-source Employee API"],
    });
    assert.ok(labels.includes("Coresignal"));
    assert.ok(labels.includes("LinkedIn"));
  });
});
