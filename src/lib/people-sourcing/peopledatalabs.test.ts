import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mapPeopleDataLabsCandidate,
  searchPeopleDataLabs,
} from "@/lib/people-sourcing/peopledatalabs";
import type { JobRequisition } from "@/lib/types";

const job: JobRequisition = {
  id: "job_pdl_test",
  orgId: "org_test",
  title: "Operations Manager",
  location: "Atlanta, GA",
  employmentType: "full_time",
  description: "Lead warehouse operations",
  requiredSkills: ["operations", "leadership"],
  preferredSkills: [],
  status: "open",
  createdAt: new Date().toISOString(),
};

describe("searchPeopleDataLabs", () => {
  it("skips when API key is missing", async () => {
    const prev = process.env.PEOPLEDATALABS_API_KEY;
    const prevAlt = process.env.PDL_API_KEY;
    delete process.env.PEOPLEDATALABS_API_KEY;
    delete process.env.PDL_API_KEY;
    delete process.env.PEOPLE_DATA_LABS_API_KEY;

    const result = await searchPeopleDataLabs({ job, limit: 5 });
    assert.equal(result.provider, "peopledatalabs");
    assert.equal(result.mode, "skipped");
    assert.equal(result.candidates.length, 0);

    if (prev != null) process.env.PEOPLEDATALABS_API_KEY = prev;
    if (prevAlt != null) process.env.PDL_API_KEY = prevAlt;
  });
});

describe("mapPeopleDataLabsCandidate", () => {
  it("builds a real resumeText from experience history when summary is empty (Mobility Driver)", () => {
    const candidate = mapPeopleDataLabsCandidate(
      {
        id: "pdl_driver_1",
        full_name: "Jordan Miles",
        job_title: "Mobility Driver",
        job_company_name: "City Transit Co",
        location_name: "Atlanta, Georgia",
        // Premium narrative fields often empty on blue-collar rows
        summary: null,
        headline: null,
        job_summary: null,
        skills: ["driving", "customer service"],
        inferred_years_experience: 8,
        experience: [
          {
            title: { name: "Mobility Driver" },
            company: { name: "City Transit Co" },
            start_date: "2019-03",
            end_date: null,
            location_names: ["Atlanta, Georgia"],
          },
          {
            title: { name: "Delivery Driver" },
            company: { name: "Parcel Express" },
            start_date: "2015-01",
            end_date: "2019-02",
          },
        ],
        education: [
          {
            school: { name: "Atlanta Technical College" },
            degrees: ["Certificate"],
            end_date: "2014",
          },
        ],
      },
      0,
      "job_mobility_driver",
    );

    assert.ok(candidate);
    assert.equal(candidate.fullName, "Jordan Miles");
    assert.ok((candidate.resumeText || "").length >= 80);
    assert.match(candidate.resumeText || "", /EXPERIENCE/);
    assert.match(candidate.resumeText || "", /Mobility Driver — City Transit Co/);
    assert.match(candidate.resumeText || "", /Delivery Driver — Parcel Express/);
    assert.match(candidate.resumeText || "", /EDUCATION/);
    assert.match(candidate.resumeText || "", /SKILLS/);
    assert.match(candidate.resumeText || "", /driving/);
  });

  it("returns null when PDL row has no mappable work history", () => {
    const candidate = mapPeopleDataLabsCandidate(
      {
        id: "pdl_empty_1",
        full_name: "No History",
        // No job_title / company / experience array
        skills: ["driving"],
      },
      0,
      "job_mobility_driver",
    );
    assert.equal(candidate, null);
  });
});
