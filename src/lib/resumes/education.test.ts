import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  educationFromProviderRow,
  ensureEducationInResumeText,
  parseEducationFromResumeText,
} from "@/lib/resumes/education";

describe("resume education helpers", () => {
  it("parses EDUCATION block from resume text", () => {
    const text = [
      "SUMMARY",
      "Ops lead",
      "",
      "EDUCATION",
      "B.S. Operations Management — Georgia Tech",
      "Graduated 2014",
      "",
      "SKILLS",
      "lean, wms",
    ].join("\n");
    const lines = parseEducationFromResumeText(text);
    assert.equal(lines[0], "B.S. Operations Management — Georgia Tech");
    assert.equal(lines[1], "Graduated 2014");
  });

  it("maps People Data Labs education arrays", () => {
    const lines = educationFromProviderRow({
      education: [
        {
          school: { name: "Emory University" },
          degrees: ["B.A. Management"],
          majors: ["Management"],
          end_date: "2016",
        },
      ],
    });
    assert.ok(lines.length >= 1);
    assert.match(String(lines[0].school), /Emory/);
    assert.match(String(lines[0].degree), /Management/);
  });

  it("inserts EDUCATION before SKILLS when missing", () => {
    const { resumeText, educationText } = ensureEducationInResumeText({
      resumeText: [
        "Alex Example",
        "",
        "SUMMARY",
        "Floor lead",
        "",
        "EXPERIENCE",
        "Supervisor — Chicago",
        "",
        "SKILLS",
        "lean",
      ].join("\n"),
      educationLines: [
        { degree: "B.S. Industrial Engineering", school: "Georgia Tech", year: 2015 },
      ],
    });
    assert.match(educationText, /Industrial Engineering/);
    const educationAt = resumeText.indexOf("EDUCATION");
    const skillsAt = resumeText.indexOf("SKILLS");
    assert.ok(educationAt > 0);
    assert.ok(skillsAt > educationAt);
    assert.match(resumeText, /B\.S\. Industrial Engineering — Georgia Tech/);
  });

  it("synthesizes education when provider omits it", () => {
    const { resumeText } = ensureEducationInResumeText({
      resumeText: "Pat Lee\n\nSUMMARY\nLead\n\nSKILLS\nwms",
      fullName: "Pat Lee",
      experienceYears: 8,
      seed: 42,
    });
    assert.match(resumeText, /EDUCATION/);
    assert.match(resumeText, /Graduated \d{4}/);
  });
});
