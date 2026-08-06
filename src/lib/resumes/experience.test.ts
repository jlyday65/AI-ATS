import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  experienceFromProviderRow,
  experienceTextFromLines,
  formatExperienceLines,
  hasMappedWorkHistory,
  hasUsableResumeWithWorkHistory,
} from "@/lib/resumes/experience";

describe("resume experience helpers", () => {
  it("maps People Data Labs experience arrays", () => {
    const lines = experienceFromProviderRow({
      experience: [
        {
          title: { name: "Mobility Driver" },
          company: { name: "City Transit Co" },
          start_date: "2019-03",
          end_date: "2024-01",
          summary: "Passenger transport and route compliance.",
          location_names: ["Atlanta, Georgia"],
        },
        {
          title: { name: "Delivery Driver" },
          company: { name: "Parcel Express" },
          start_date: "2016-06",
          end_date: "2019-02",
        },
      ],
    });
    assert.equal(lines.length, 2);
    assert.equal(lines[0].title, "Mobility Driver");
    assert.equal(lines[0].company, "City Transit Co");
    assert.match(String(lines[0].summary), /Passenger transport/);
  });

  it("formats multi-role experience for resume text", () => {
    const text = experienceTextFromLines(
      experienceFromProviderRow({
        experience: [
          {
            title: { name: "Mobility Driver" },
            company: { name: "City Transit Co" },
            start_date: "2019-03-01",
            end_date: null,
          },
          {
            title: { name: "Van Driver" },
            company: { name: "Local Moves LLC" },
            start_date: "2015",
            end_date: "2019",
          },
        ],
      }),
    );
    assert.match(text, /Mobility Driver — City Transit Co/);
    assert.match(text, /2019-03 – Present/);
    assert.match(text, /Van Driver — Local Moves LLC/);
  });

  it("falls back to current job fields when experience array is empty", () => {
    const lines = experienceFromProviderRow({
      job_title: "Mobility Driver",
      job_company_name: "FleetCo",
    });
    assert.equal(lines.length, 1);
    assert.equal(lines[0].title, "Mobility Driver");
    const formatted = formatExperienceLines(lines).join("\n");
    assert.match(formatted, /Mobility Driver — FleetCo/);
  });

  it("requires a non-empty EXPERIENCE section for mapped work history", () => {
    const withHistory = [
      "Jordan Miles",
      "",
      "SUMMARY",
      "Driver",
      "",
      "EXPERIENCE",
      "Mobility Driver — City Transit Co",
      "2019-03 – Present",
      "",
      "SKILLS",
      "driving",
    ].join("\n");
    assert.equal(hasMappedWorkHistory(withHistory), true);
    assert.equal(hasUsableResumeWithWorkHistory(withHistory), true);

    const noExperience = [
      "Jordan Miles",
      "",
      "SUMMARY",
      "Driver with some background text padded to look long enough for the gate",
      "",
      "SKILLS",
      "driving, routes, customer service, safety",
    ].join("\n");
    assert.equal(hasMappedWorkHistory(noExperience), false);
    assert.equal(hasUsableResumeWithWorkHistory(noExperience), false);

    const emptyExperience = [
      "Name",
      "",
      "EXPERIENCE",
      "",
      "",
      "SKILLS",
      "driving, routes, customer service, safety, and more padding here",
    ].join("\n");
    assert.equal(hasMappedWorkHistory(emptyExperience), false);
    assert.equal(hasUsableResumeWithWorkHistory(emptyExperience), false);
  });
});
