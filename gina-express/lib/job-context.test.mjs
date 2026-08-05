import assert from "node:assert/strict";
import {
  extractJobContext,
  jobRecordFromContext,
  screeningQuestionsFromJob,
  skillsFromJobDescription,
} from "./job-context.js";

const ctx = extractJobContext({
  selectedJob: {
    id: "job_1",
    title: "Appliance Production Floor Manager",
    location: "Chicago, IL",
    description:
      "Oversee daily manufacturing. Must have Lean Manufacturing and OSHA experience. ERP/Excel required.",
  },
});
assert.equal(ctx.roleTitle, "Appliance Production Floor Manager");
assert.equal(ctx.location, "Chicago, IL");
assert.match(ctx.roleDescription, /Lean Manufacturing/);

const skills = skillsFromJobDescription(ctx.roleDescription);
assert.ok(skills.includes("lean") || skills.includes("manufacturing"));
assert.ok(skills.includes("osha") || skills.includes("erp") || skills.includes("excel"));

const qs = screeningQuestionsFromJob(ctx);
assert.ok(qs.length >= 5);
assert.match(qs[0].question, /Appliance Production Floor Manager/);
assert.ok(qs.some((q) => /Lean|OSHA|ERP|Excel|requirements/i.test(q.question)));

const record = jobRecordFromContext({
  roleTitle: "Appliance Production Floor Manager",
  location: "Chicago, IL",
  roleDescription:
    "Oversee daily manufacturing. Must have Lean Manufacturing and OSHA experience. ERP/Excel required. Schedule shifts and hit production targets.",
});
assert.equal(record.title, "Appliance Production Floor Manager");
assert.ok(record.description.length > 40);
assert.equal(record.location, "Chicago, IL");

console.log("job-context tests OK");
