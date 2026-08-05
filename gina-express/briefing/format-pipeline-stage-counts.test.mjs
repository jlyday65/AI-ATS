#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  formatMorningPipelineBriefing,
  formatPipelineStageCounts,
  formatTeamUpdateLikeNotes,
} from "./format-pipeline-stage-counts.js";

const counts = formatPipelineStageCounts({
  new: 5,
  screening: 0,
  interview: 0,
  offer: 0,
  hired: 0,
  rejected: 0,
});
assert.match(counts, /📊 Pipeline Stage Counts/);
assert.match(counts, /• 🆕 New: 5/);
assert.match(counts, /• ✅ Hired: 0/);

const noteBlock = formatTeamUpdateLikeNotes({
  from: "Maria",
  role: "Sourcer",
  at: "2026-08-05T20:05:00.000Z",
  task: "Source Auto Production Floor Supervisor in Detroit",
  reply: [
    "Maria — sourcing update (Aug 5, 2026)",
    "",
    "Request: Source candidates",
    "• Shortlist ready: 5 candidate(s)",
    "• Top names: Ava, Ben",
  ].join("\n"),
});
assert.match(noteBlock, /Maria \(Sourcer\)/);
assert.match(noteBlock, /Ask: Source Auto Production Floor Supervisor/);
assert.match(noteBlock, /• Shortlist ready: 5/);

const briefing = formatMorningPipelineBriefing({
  stageCounts: { new: 5, screening: 0, interview: 0, offer: 0, hired: 0, rejected: 0 },
  remindersDue: [],
  teamUpdates: [
    {
      from: "Maria",
      role: "Sourcer",
      task: "Source role",
      reply: "Maria — sourcing update\n\n• Shortlist ready: 5",
      at: "2026-08-05T20:05:00.000Z",
    },
  ],
  asOf: "2026-08-05T22:30:00.000Z",
});
assert.match(briefing, /📋 Pipeline overview/);
assert.match(briefing, /📝 Team updates \(Kimberley Notes\)/);
assert.match(briefing, /⏰ Reminders due/);
assert.match(briefing, /• None/);
assert.match(briefing, /Maria \(Sourcer\)/);
assert.match(briefing, /Ask: Source role/);
assert.doesNotMatch(briefing, /Key Takeaways/);

console.log("format-pipeline-stage-counts tests passed");
