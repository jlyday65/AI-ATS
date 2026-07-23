const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  relayAuth,
  extractProvidedSecrets,
  timingSafeEqualString,
} = require("./relay-auth.middleware");

function mockReq(headers = {}) {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    get(name) {
      return normalized[String(name).toLowerCase()];
    },
  };
}

function runMiddleware(req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        resolve({ next: false, statusCode: this.statusCode, body: payload });
        return this;
      },
    };
    relayAuth(req, res, () => resolve({ next: true }));
  });
}

describe("relayAuth Express middleware", () => {
  it("compares secrets in constant-time helper", () => {
    assert.equal(timingSafeEqualString("abc", "abc"), true);
    assert.equal(timingSafeEqualString("abc", "abd"), false);
    assert.equal(timingSafeEqualString("abc", "ab"), false);
  });

  it("reads X-Relay-Secret and Bearer", () => {
    assert.deepEqual(extractProvidedSecrets(mockReq({ "x-relay-secret": "s1" })), [
      "s1",
    ]);
    assert.deepEqual(
      extractProvidedSecrets(mockReq({ authorization: "Bearer s2" })),
      ["s2"],
    );
  });

  it("skips auth when RELAY_SECRET is unset", async () => {
    const prev = process.env.RELAY_SECRET;
    delete process.env.RELAY_SECRET;
    try {
      const result = await runMiddleware(mockReq());
      assert.equal(result.next, true);
    } finally {
      if (prev === undefined) delete process.env.RELAY_SECRET;
      else process.env.RELAY_SECRET = prev;
    }
  });

  it("rejects missing/invalid secrets with Gina-shaped 401", async () => {
    const prev = process.env.RELAY_SECRET;
    process.env.RELAY_SECRET = "supersecret123";
    try {
      const missing = await runMiddleware(mockReq());
      assert.equal(missing.next, false);
      assert.equal(missing.statusCode, 401);
      assert.deepEqual(missing.body, { error: "Not authenticated" });

      const wrong = await runMiddleware(mockReq({ "x-relay-secret": "nope" }));
      assert.equal(wrong.statusCode, 401);
    } finally {
      if (prev === undefined) delete process.env.RELAY_SECRET;
      else process.env.RELAY_SECRET = prev;
    }
  });

  it("accepts X-Relay-Secret or Authorization: Bearer", async () => {
    const prev = process.env.RELAY_SECRET;
    process.env.RELAY_SECRET = "supersecret123";
    try {
      const viaHeader = await runMiddleware(
        mockReq({ "x-relay-secret": "supersecret123" }),
      );
      assert.equal(viaHeader.next, true);

      const viaBearer = await runMiddleware(
        mockReq({ authorization: "Bearer supersecret123" }),
      );
      assert.equal(viaBearer.next, true);
    } finally {
      if (prev === undefined) delete process.env.RELAY_SECRET;
      else process.env.RELAY_SECRET = prev;
    }
  });
});
