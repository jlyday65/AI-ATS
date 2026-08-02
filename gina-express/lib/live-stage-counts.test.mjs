#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  countLiveStageCounts,
  totalLiveCandidates,
} from "./live-stage-counts.js";

assert.deepEqual(countLiveStageCounts([]), {
  new: 0,
  screening: 0,
  interview: 0,
  offer: 0,
  hired: 0,
  rejected: 0,
});

const counts = countLiveStageCounts([
  { name: "A", stage: "new" },
  { name: "B", stage: "New" },
  { name: "C", stage: "screening" },
  { name: "D", stage: "Phone Screen" },
  { name: "E", stage: "interview" },
]);
assert.equal(counts.new, 2);
assert.equal(counts.screening, 2);
assert.equal(counts.interview, 1);
assert.equal(totalLiveCandidates(counts), 5);

// Empty board must never look like 64
assert.equal(totalLiveCandidates(countLiveStageCounts([])), 0);

console.log("live-stage-counts tests OK");
