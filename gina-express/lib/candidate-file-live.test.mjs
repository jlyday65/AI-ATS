#!/usr/bin/env node
/**
 * Tests for live Candidate File sync helpers.
 */
import assert from "node:assert/strict";
import {
  createCandidateFiles,
} from "./candidate-files.js";
import {
  isLiveFile,
  findLiveCandidateFile,
  upsertCandidatesIntoLiveFile,
  syncBotEventToCandidateFile,
  buildCandidateFileUpdateNote,
} from "./candidate-file-live.js";

const store = createCandidateFiles();

const created = await store.createFile({
  clientName: "Acme",
  job: {
    title: "Auto Production Floor Supervisor",
    description: "Lead floor ops in Detroit plant with 5+ years automotive experience.",
    location: "Detroit, MI",
    salary: "$75k–$90k",
  },
});
assert.equal(created.live, true);
assert.ok(isLiveFile(created));

const upsert = await upsertCandidatesIntoLiveFile(
  { candidateFileId: created.id },
  [
    {
      name: "Ava Chen",
      resumeText: "Ava — 8 years floor leadership",
      email: "ava@example.com",
    },
    { name: "Ben Lee", resumeText: "Ben — production supervisor" },
  ],
  { store, notify: false, fromAgent: "Maria" },
);
assert.equal(upsert.ok, true);
assert.equal(upsert.upserted, 2);
assert.equal(upsert.file.candidates.length, 2);

// Second Maria run merges — no duplicates
const upsert2 = await upsertCandidatesIntoLiveFile(
  { candidateFileId: created.id },
  [{ name: "Ava Chen", resumeText: "Ava — updated resume", phone: "555-0100" }],
  { store, notify: false },
);
assert.equal(upsert2.file.candidates.length, 2);
assert.match(upsert2.file.candidates.find((c) => c.name === "Ava Chen").resumeText, /updated/);

const found = await findLiveCandidateFile(
  { jobTitle: "Auto Production Floor Supervisor" },
  store,
);
assert.equal(found.id, created.id);

const stageSync = await syncBotEventToCandidateFile(
  {
    type: "update_stage",
    fromAgent: "Kelley",
    candidateFileId: created.id,
    name: "Ava Chen",
    stage: "screening",
  },
  { store, notify: false },
);
assert.equal(stageSync.ok, true);
assert.equal(
  stageSync.file.candidates.find((c) => c.name === "Ava Chen").stage,
  "screening",
);

await store.setScreeningQuestions(created.id, ["Shift OK?", "Travel OK?"]);
const qsFile = await store.getFile(created.id);
assert.equal(qsFile.status, "screening");
assert.equal(qsFile.live, true);

const preview = await store.exportForClient(created.id, { markSent: false });
assert.equal(preview.file.live, true);
assert.notEqual(preview.file.status, "sent");

const sent = await store.sendToClient(created.id);
assert.equal(sent.file.status, "sent");
assert.equal(sent.file.live, false);
assert.ok(!isLiveFile(sent.file));

// Closed file rejects Maria writes
let rejected = false;
try {
  await store.addCandidate(created.id, { name: "Should Fail" });
} catch {
  rejected = true;
}
assert.equal(rejected, true);

const note = buildCandidateFileUpdateNote({
  file: created,
  fromAgent: "Maria",
  summary: "Added 2 candidates",
  changeType: "candidates",
});
assert.match(note, /Candidate File update/);
assert.match(note, /\/candidate-file\?id=/);

const canceled = await store.createFile({
  job: { title: "Temp Role", description: "x".repeat(50) },
});
await store.cancelFile(canceled.id, { reason: "Client paused" });
const c2 = await store.getFile(canceled.id);
assert.equal(c2.status, "canceled");
assert.equal(c2.live, false);

console.log("candidate-file-live tests passed");
