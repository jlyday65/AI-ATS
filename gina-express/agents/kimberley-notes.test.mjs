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

  it("files a Kelley status update for plain update asks", () => {
    const reply = buildKelleyReply({
      task: "Provide a pipeline ops status update for Kimberley",
    });
    assert.match(reply, /Kelley — status update/);
    assert.match(reply, /Kimberley's Notes/);
    assert.match(reply, /pipeline summary|Team updates/i);
    assert.match(reply, /Handoff/);
  });

  it("dual-files Maria / Michelle / Ashton replies too", () => {
    for (const [id, task] of [
      ["maria", "Provide a sourcing status update for Kimberley"],
      ["michelle", "Provide a screening status update for Kimberley"],
      ["ashton", "Provide a project status update for Kimberley"],
    ]) {
      const reply = buildBotReply({ agentId: id, task });
      assert.match(reply, /Kimberley's Notes/, id);
      assert.match(reply, /Team updates|pipeline summary/i, id);
    }
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
    const actionId = `act_dup_${Date.now()}`;
    const ack = await notes.insertNote({
      fromAgent: "Kelley",
      agentRole: "Pipeline ops",
      task: "move Ava to Interview",
      reply: "Kelley — queued",
      actionId,
    });
    const done = await notes.upsertByActionId(actionId, {
      fromAgent: "Kelley",
      agentRole: "Pipeline ops",
      task: "move Ava to Interview",
      reply: "Kelley — pipeline ops update",
    });
    assert.equal(String(done.id), String(ack.id));
    assert.match(done.reply, /pipeline ops update/);
    const listed = await notes.listNotes({ agent: "Kelley", limit: 50 });
    assert.equal(listed.filter((n) => n.actionId === actionId).length, 1);
  });

  it("normalizes object action ids and collapses duplicates on list", async () => {
    const { normalizeActionId, collapseNotesByActionId, createKimberleyNotes: create } =
      await import("../lib/kimberley-notes.js");
    assert.equal(normalizeActionId({ id: 89 }), "89");
    assert.equal(normalizeActionId("89"), "89");
    const notes = create();
    await notes.insertNote({
      fromAgent: "Maria",
      agentRole: "Sourcer",
      task: "source WAM",
      reply: "ack",
      actionId: { id: 89 },
    });
    await notes.upsertByActionId(89, {
      fromAgent: "Maria",
      agentRole: "Sourcer",
      task: "source WAM",
      reply: "done",
    });
    // Simulate a stale duplicate that snuck in
    await notes.upsertByActionId(89, {
      fromAgent: "Maria",
      agentRole: "Sourcer",
      task: "source WAM",
      reply: "done again",
    });
    const listed = await notes.listNotes({ agent: "Maria", limit: 50 });
    assert.equal(listed.filter((n) => String(n.actionId) === "89").length, 1);
    assert.match(listed[0].reply, /done again/);
    const collapsed = collapseNotesByActionId([
      { actionId: "1", reply: "a" },
      { actionId: "1", reply: "b" },
      { actionId: null, reply: "c" },
    ]);
    assert.equal(collapsed.length, 2);
  });
});

describe("Pipeline Stage Counts formatter", () => {
  it("leads with Pipeline Stage Counts in stage order", () => {
    const text = formatPipelineStageCounts({
      offer: 1,
      new: 4,
      screening: 2,
    });
    assert.match(text.split("\n")[0], /Pipeline Stage Counts/);
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
          role: "Pipeline ops",
          task: "ask Kelly for an update",
          reply:
            "Kelley — status update\nRequest: ask Kelly for an update\nPipeline ops status:\n- Reviewing open ATS actions\n- Flagging stuck stages",
        },
      ],
    });
    assert.match(brief, /Pipeline (Stage Counts|overview)/);
    assert.match(brief, /Team updates \(Kimberley Notes\)/);
    assert.match(brief, /Kelley/);
    assert.match(brief, /Reviewing open ATS actions|Flagging stuck stages|ask Kelly for an update/);
    assert.match(brief, /Reminders due/);
    // Notes-style Ask + bullets (not one-line "Kelley: preview")
    assert.match(brief, /Ask:/);
    assert.match(brief, /•/);
  });

  it("includes Kelly alias updates in briefing", () => {
    const brief = formatMorningPipelineBriefing({
      stageCounts: { new: 0 },
      teamUpdates: [
        {
          from: "Kelly",
          role: "Pipeline ops",
          reply: "Kelly — status update\n- Weekly ops checklist in progress",
        },
      ],
    });
    assert.match(brief, /Kelley/);
    assert.match(brief, /Weekly ops checklist/);
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
