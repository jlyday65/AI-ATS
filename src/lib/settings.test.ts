import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  modeTagForMode,
  normalizeAppSettings,
  normalizeAtsMode,
  normalizeSessionTimeout,
  sourceLabelForMode,
} from "@/lib/settings";
import {
  createSessionToken,
  passwordsMatch,
  verifySessionToken,
} from "@/lib/auth/session";

describe("ATS mode settings", () => {
  it("normalizes mode and timeout options", () => {
    assert.equal(normalizeAtsMode("live"), "live");
    assert.equal(normalizeAtsMode("nope"), "test");
    assert.equal(normalizeSessionTimeout(5), 5);
    assert.equal(normalizeSessionTimeout(10), 10);
    assert.equal(normalizeSessionTimeout(15), 15);
    assert.equal(normalizeSessionTimeout(99), 15);
  });

  it("labels Maria pushes by mode", () => {
    assert.equal(sourceLabelForMode("test"), "signalhire-test");
    assert.equal(sourceLabelForMode("live"), "signalhire");
    assert.equal(modeTagForMode("test"), "ats-test");
    assert.equal(modeTagForMode("live"), "ats-live");
  });

  it("fills defaults for partial settings", () => {
    const settings = normalizeAppSettings({});
    assert.equal(settings.atsMode, "test");
    assert.equal(settings.sessionTimeoutMinutes, 15);
  });
});

describe("live session tokens", () => {
  it("accepts a fresh token and rejects an expired one", async () => {
    const now = Date.now();
    const token = await createSessionToken(5, now);
    const ok = await verifySessionToken(token, now + 60_000);
    assert.equal(ok.ok, true);

    const expired = await verifySessionToken(token, now + 6 * 60_000);
    assert.equal(expired.ok, false);
    if (!expired.ok) assert.equal(expired.reason, "expired");
  });

  it("honors 10 and 15 minute timeouts", async () => {
    const now = Date.now();
    const ten = await createSessionToken(10, now);
    assert.equal((await verifySessionToken(ten, now + 9 * 60_000)).ok, true);
    assert.equal((await verifySessionToken(ten, now + 11 * 60_000)).ok, false);

    const fifteen = await createSessionToken(15, now);
    assert.equal((await verifySessionToken(fifteen, now + 14 * 60_000)).ok, true);
    assert.equal((await verifySessionToken(fifteen, now + 16 * 60_000)).ok, false);
  });

  it("compares passwords safely", () => {
    assert.equal(passwordsMatch("secret", "secret"), true);
    assert.equal(passwordsMatch("secret", "Secret"), false);
    assert.equal(passwordsMatch("", "secret"), false);
  });
});
