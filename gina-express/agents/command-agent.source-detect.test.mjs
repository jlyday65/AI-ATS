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
