#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  personDedupeKey,
  personDedupeKeys,
  samePerson,
  dedupeCandidateList,
  dedupeIncomingCandidates,
} from "./candidate-dedupe.js";

assert.equal(
  personDedupeKey({ email: "Omar.Sato@example.com", name: "Other" }),
  "e:omar.sato@example.com",
);
assert.equal(personDedupeKey({ name: "Omar Sato" }), "n:omar sato");
assert.ok(
  personDedupeKeys({ name: "Omar Sato", email: "a@example.com" }).includes(
    "n:omar sato",
  ),
);
assert.ok(samePerson({ name: "Omar Sato" }, { name: "omar sato", email: "x@y.com" }));

const { list, removed } = dedupeCandidateList([
  { id: "1", name: "Omar Sato", email: "a@example.com", resumeText: "short" },
  {
    id: "2",
    name: "Omar Sato",
    email: "a@example.com",
    resumeText: "much longer resume text on file",
  },
  { id: "3", name: "Zoe Ali", email: "zoe@example.com", resumeText: "z" },
  { id: "4", name: "Omar Sato", resumeText: "name-only duplicate" },
]);

assert.equal(removed, 2);
assert.equal(list.length, 2);
const omar = list.find((c) => /omar/i.test(c.name));
assert.ok(omar);
assert.ok(omar.resumeText.includes("much longer"));
assert.equal(omar.id, "1");
assert.equal(omar.email, "a@example.com");

const sameName = dedupeIncomingCandidates([
  { id: "a", name: "Kai Singh", resumeText: "a" },
  { id: "b", name: "Kai Singh", resumeText: "bb longer" },
]);
assert.equal(sameName.length, 1);
assert.equal(sameName[0].id, "a");
assert.match(sameName[0].resumeText, /longer/);

console.log("candidate-dedupe tests OK");
