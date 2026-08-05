#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  parseCandidateFileInstruction,
  buildGinaCandidateFileReply,
  createCandidateFileFromInstruction,
} from "../agents/candidate-file.tool.js";

const parsed = parseCandidateFileInstruction(
  'Gina fill out the candidate file for Warehouse Mechanic in Atlanta, GA, salary $28–$34/hr and send to Maria. Job description: Maintain conveyors.',
);
assert.equal(parsed.sendToMaria, true);
assert.match(parsed.job.title, /Warehouse Mechanic/i);
assert.match(parsed.job.salary, /\$28/);
assert.match(parsed.job.location, /Atlanta/i);

const simple = parseCandidateFileInstruction(
  "Gina fill out the candidate file and send to Maria.",
);
assert.equal(simple.sendToMaria, true);
assert.ok(simple.job.description.includes("Maria"));

const detroit = parseCandidateFileInstruction(
  "Please send a Candidate File to Maria: An Auto Production Floor Supervisor in Detroit, MI manages daily assembly line operations, supervises production staff, enforces safety rules, and meets shift quotas. This full-time role includes shift supervision, quality control, and process improvement. Job Duties Lead and direct assembly line workers. Requirements High school diploma or GED required.",
);
assert.equal(detroit.sendToMaria, true);
assert.match(detroit.job.title, /Auto Production Floor Supervisor/i);
assert.match(detroit.job.location, /Detroit/i);
assert.ok(detroit.job.description.length >= 40);
assert.match(detroit.job.description, /assembly line/i);
assert.notEqual(detroit.job.title, "Open role");

const reply = buildGinaCandidateFileReply({
  file: {
    id: "cf_test",
    job: { title: "Warehouse Mechanic", salary: "$28/hr" },
    clientName: "Acme",
  },
  sendToMaria: true,
  task: "fill out the candidate file and send to Maria",
});
assert.match(reply, /Gina — Candidate File/);
assert.match(reply, /Maria/);
assert.match(reply, /cf_test/);

const created = await createCandidateFileFromInstruction({
  task: "Create candidate file for Forklift Operator in Dallas, salary $22/hr. Send to Maria.",
  requestedBy: "Kimberley",
});
assert.equal(created.ok, true);
assert.ok(created.file?.id);
assert.match(created.file.job.title, /Forklift Operator/i);
assert.match(created.reply, /Handoff/);

console.log("candidate-file.tool tests passed");
