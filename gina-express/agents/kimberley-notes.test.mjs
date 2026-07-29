import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBotReply, buildKelleyReply, buildAshtonReply } from "../agents/bot-replies.js";
import {
  formatMorningPipelineBriefing,
  formatPipelineStageCounts,
} from "../briefing/format-pipeline-stage-counts.js";
import { createKimberleyNotes } from "../lib/kimberley-notes.js";

describe("bot replies for Kimberley Notes", () => {
  it("files a Kelley weekly blogs style update", () => {
    const reply = buildKelleyReply({
      task: "give Kimberley an update on the weekly blogs",
    });
    assert.match(reply, /Kelley/);
    assert.match(reply, /weekly blogs/i);
    assert.match(reply, /Pipeline Stage Counts/i);
  });

  it("files an Ashton project status update", () => {
    const reply = buildAshtonReply({
      task: "give me an update on the project status",
    });
    assert.match(reply, /Ashton/);
    assert.match(reply, /project status/i);
  });

  it("routes by agent id", () => {
    assert.match(buildBotReply({ agentId: "michelle", task: "screen Ava" }), /Michelle/);
    assert.match(
      buildBotReply({
        agentId: "maria",
        task: "source OM",
        result: { job: { title: "Operations Manager" }, candidateCount: 3, topCandidates: [{ name: "Ava" }] },
      }),
      /Operations Manager/,
    );
  });

  it("files queue acks separately from execute replies", () => {
    const ack = buildBotReply({
      agentId: "michelle",
      task: "screen Warehouse Mechanic candidates",
      phase: "queued",
    });
    assert.match(ack, /queued/i);
    assert.match(ack, /Check for actions/i);
    const done = buildBotReply({
      agentId: "michelle",
      task: 'screen "Ava Chen" for Warehouse Mechanic',
    });
    assert.match(done, /screening update/i);
    assert.match(done, /Ava Chen/);
    assert.match(done, /Handoff/i);
  });
});

describe("kimberley notes upsert by action", () => {
  it("replaces ack with execute reply for same actionId", async () => {
    const notes = createKimberleyNotes();
    const ack = await notes.insertNote({
      fromAgent: "Kelley",
      agentRole: "Pipeline ops",
      task: "move Ava to Interview",
      reply: "Kelley — queued",
      actionId: "act_dup_1",
    });
    const done = await notes.upsertByActionId("act_dup_1", {
      fromAgent: "Kelley",
      agentRole: "Pipeline ops",
      task: "move Ava to Interview",
      reply: "Kelley — pipeline ops update",
    });
    assert.equal(done.id, ack.id);
    assert.match(done.reply, /pipeline ops update/);
    const listed = await notes.listNotes({ agent: "Kelley", limit: 20 });
    assert.equal(listed.filter((n) => n.actionId === "act_dup_1").length, 1);
  });
});

describe("Pipeline Stage Counts formatter", () => {
  it("leads with Pipeline Stage Counts in stage order", () => {
    const text = formatPipelineStageCounts({
      offer: 1,
      new: 4,
      screening: 2,
    });
    assert.equal(text.split("\n")[0], "Pipeline Stage Counts");
    assert.match(text, /New: 4/);
    assert.match(text, /Screening: 2/);
    assert.match(text, /Interview: 0/);
    assert.match(text, /Offer: 1/);
    const newAt = text.indexOf("New:");
    const screeningAt = text.indexOf("Screening:");
    const offerAt = text.indexOf("Offer:");
    assert.ok(newAt < screeningAt && screeningAt < offerAt);
  });

  it("includes team updates section for morning briefing", () => {
    const brief = formatMorningPipelineBriefing({
      stageCounts: { new: 1, screening: 1 },
      teamUpdates: [
        {
          from: "Kelley",
          reply: "Kelley — weekly blogs update\nDraft topics confirmed",
        },
      ],
    });
    assert.match(brief, /Pipeline Stage Counts/);
    assert.match(brief, /Team updates \(Kimberley Notes\)/);
    assert.match(brief, /Kelley/);
    assert.match(brief, /Reminders due/);
  });
});

describe("kimberley notes store", () => {
  it("inserts and lists file-backed notes", async () => {
    const notes = createKimberleyNotes();
    const row = await notes.insertNote({
      fromAgent: "Ashton",
      agentRole: "Outreach",
      task: "project status",
      reply: "Ashton — project status update",
    });
    assert.ok(row.id);
    const listed = await notes.listNotes({ agent: "Ashton", limit: 5 });
    assert.ok(listed.some((n) => n.id === row.id));
  });
});
