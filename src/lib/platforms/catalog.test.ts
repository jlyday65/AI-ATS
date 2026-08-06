import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CANDIDATE_PLATFORMS } from "@/lib/platforms/catalog";

describe("candidate platform catalog", () => {
  it("covers at least 45 platforms with unique ids", () => {
    assert.ok(CANDIDATE_PLATFORMS.length >= 45);
    const ids = CANDIDATE_PLATFORMS.map((platform) => platform.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("includes core hireEZ-style sources", () => {
    const ids = new Set(CANDIDATE_PLATFORMS.map((platform) => platform.id));
    for (const required of [
      "linkedin",
      "peopledatalabs",
      "github",
      "stackoverflow",
      "kaggle",
      "google_scholar",
      "dribbble",
      "ats_rediscovery",
    ]) {
      assert.ok(ids.has(required), `missing ${required}`);
    }
  });
});
