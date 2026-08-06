import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { looksLikeSourceTask } from "./command-agent.tool.js";

describe("looksLikeSourceTask", () => {
  it("treats Home Depot Sourcing update requests as status, not source", () => {
    assert.equal(
      looksLikeSourceTask(
        "Provide a status update for Kimberley. Topic: Update Request: Home Depot Sourcing",
      ),
      false,
    );
    assert.equal(
      looksLikeSourceTask(
        "Requesting an update on the Home Depot Sourcing project",
      ),
      false,
    );
    assert.equal(
      looksLikeSourceTask(
        "Kimberley is requesting a full status update on the Home Depot sourcing project. Please provide details on any candidates sourced, shortlisted, or pending review as soon as possible.",
      ),
      false,
    );
    assert.equal(
      looksLikeSourceTask(
        "Hi Maria, Kimberley is following up on the Home Depot sourcing. The ATS is currently showing zero candidates sourced for this role. Can you please provide an update on why no candidates have been sourced yet, and let us know your expected timeline for delivering qualified candidates?",
      ),
      false,
    );
  });

  it("still detects real Maria source asks", () => {
    assert.equal(
      looksLikeSourceTask(
        "Source a Warehouse Mechanic candidate in Atlanta, GA",
      ),
      true,
    );
    assert.equal(
      looksLikeSourceTask("Find candidates for Operations Manager"),
      true,
    );
  });
});
