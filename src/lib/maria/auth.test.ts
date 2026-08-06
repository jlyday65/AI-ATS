import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fingerprintSecret,
  hasValidMariaRelay,
  readRelaySecretFromRequest,
} from "@/lib/maria/auth";

describe("maria auth", () => {
  it("reads a single X-Relay-Secret header", () => {
    const request = new Request("http://localhost/api/maria/source", {
      headers: { "X-Relay-Secret": "abc123" },
    });
    assert.equal(readRelaySecretFromRequest(request), "abc123");
  });

  it("reads Bearer authorization", () => {
    const request = new Request("http://localhost/api/maria/source", {
      headers: { Authorization: "Bearer tokensecret" },
    });
    assert.equal(readRelaySecretFromRequest(request), "tokensecret");
  });

  it("fingerprints secrets without exposing them", () => {
    assert.equal(fingerprintSecret(""), "empty");
    assert.match(fingerprintSecret("z8in8r5x2o7k6m4"), /^len=15,sha256_8=[0-9a-f]{8}$/);
  });

  it("rejects missing relay when expected secret is empty", () => {
    const request = new Request("http://localhost/api/maria/source");
    // Without a configured store/env secret, validation fails closed.
    assert.equal(hasValidMariaRelay(request), false);
  });
});
