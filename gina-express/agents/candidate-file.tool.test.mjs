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
