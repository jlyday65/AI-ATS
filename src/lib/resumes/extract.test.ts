import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractFromResumeText } from "@/lib/resumes/extract";

describe("resume extract", () => {
  it("pulls name, email, phone, and skills from plain text", () => {
    const text = `
Liam Garcia
Charlotte, NC
liam.garcia@example.com
(704) 555-0199

Warehouse Manager with 14 years of experience leading distribution centers.
Skilled in WMS, inventory control, OSHA compliance, forklift operations, and logistics.
`;
    const parsed = extractFromResumeText(text);
    assert.equal(parsed.fullName, "Liam Garcia");
    assert.equal(parsed.email, "liam.garcia@example.com");
    assert.ok(parsed.phone?.includes("704"));
    assert.equal(parsed.experienceYears, 14);
    assert.ok(parsed.skills.includes("warehouse"));
    assert.ok(parsed.skills.includes("wms") || parsed.skills.includes("osha"));
    assert.ok(parsed.resumeText.includes("distribution centers"));
  });
});
