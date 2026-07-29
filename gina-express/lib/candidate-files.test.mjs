#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  buildClientExport,
  createCandidateFiles,
} from "../lib/candidate-files.js";

const store = createCandidateFiles();

const created = await store.createFile({
  clientName: "Acme Logistics",
  createdBy: "Gina",
  job: {
    title: "Warehouse Mechanic",
    description: "Maintain conveyors and forklifts in Atlanta DC.",
    salary: "$28–$34/hr",
    location: "Atlanta, GA",
  },
});
assert.ok(created.id);
assert.equal(created.status, "sourcing");
assert.equal(created.job.title, "Warehouse Mechanic");

const withCand = await store.addCandidate(created.id, {
  name: "Ava Chen",
  email: "ava@example.com",
  resumeText: "Ava Chen\nMechanic with 6 years warehouse experience.",
  source: "Maria",
});
assert.equal(withCand.candidates.length, 1);

const withQs = await store.setScreeningQuestions(created.id, [
  "Do you have conveyor repair experience?",
  "Are you available for 2nd shift?",
]);
assert.equal(withQs.screeningQuestions.length, 2);
assert.equal(withQs.status, "screening");

const candId = withQs.candidates[0].id;
const withAns = await store.setCandidateAnswers(created.id, candId, [
  { question: "Do you have conveyor repair experience?", answer: "Yes, 4 years." },
  { question: "Are you available for 2nd shift?", answer: "Yes." },
]);
assert.match(withAns.candidates[0].screening[0].answer, /Yes/);

const exported = await store.exportForClient(created.id, { saveArchive: true });
assert.ok(exported.text);
assert.match(exported.text, /CANDIDATE FILE — CLIENT REVIEW/);
assert.match(exported.text, /Warehouse Mechanic/);
assert.match(exported.text, /\$28–\$34\/hr/);
assert.match(exported.text, /Ava Chen/);
assert.match(exported.text, /conveyor repair/i);
assert.match(exported.text, /Yes, 4 years/);
assert.equal(exported.file.status, "ready");
assert.ok(exported.file.exportHistory.length >= 1);

const text2 = buildClientExport(exported.file);
assert.match(text2, /Client action:/);

console.log("candidate-files tests passed");
