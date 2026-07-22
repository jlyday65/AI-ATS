import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GINA_DEFAULT_BASE_URL, testGinaConnection } from "@/lib/ats/gina-client";

describe("gina production connector", () => {
  it("defaults to the Railway production host", () => {
    assert.match(GINA_DEFAULT_BASE_URL, /lyday-gina-backend-production\.up\.railway\.app/);
  });

  it("reaches Gina health endpoint", async () => {
    const result = await testGinaConnection({
      baseUrl: GINA_DEFAULT_BASE_URL,
    });
    assert.equal(result.healthOk, true);
    assert.match(result.message, /health check passed|Connected to Gina/i);
  });
});
