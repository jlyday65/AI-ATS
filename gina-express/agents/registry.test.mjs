import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  listCommandableAgents,
  normalizeAgentName,
  resolveAgent,
} from "./registry.js";
import { commandAgent } from "./command-agent.tool.js";

describe("gina team registry", () => {
  it("resolves Kelley/Kelly aliases", () => {
    assert.equal(normalizeAgentName("Kelley"), "kelley");
    assert.equal(normalizeAgentName("kelly"), "kelley");
    assert.equal(resolveAgent("Kelly")?.route, "/kelly");
  });

  it("lists four commandable bots", () => {
    const ids = listCommandableAgents().map((a) => a.id);
    assert.deepEqual(ids, ["maria", "michelle", "kelley", "ashton"]);
  });

  it("prepares Michelle command without refusing", async () => {
    const result = await commandAgent({
      targetAgent: "michelle",
      task: "Screen Warehouse Mechanic candidates for Atlanta",
      requestedBy: "Kimberley",
    });
    assert.equal(result.ok, true);
    assert.equal(result.agent, "Michelle");
    assert.match(result.message, /Michelle/);
    assert.match(result.reply || "", /Michelle/);
    assert.ok(result.kimberleyNoteId);
  });

  it("queues via queueAction helper without executing work", async () => {
    const result = await commandAgent({
      targetAgent: "ashton",
      task: "Draft follow-up to Atlanta shortlist",
      requestedBy: "Kimberley",
      queueAction: async (type, payload) => {
        assert.equal(type, "command_agent");
        assert.equal(payload.targetAgent, "ashton");
        return "action_1";
      },
    });
    assert.equal(result.queued, true);
    assert.equal(result.executed, false);
    assert.equal(result.actionId, "action_1");
    assert.match(result.reply || "", /queued/i);
    assert.match(result.reply || "", /Ashton/);
  });

  it("executeNow replaces queue ack with working Ashton reply", async () => {
    const result = await commandAgent({
      targetAgent: "ashton",
      task: 'Draft follow-up to "Ava Chen"',
      requestedBy: "Kimberley",
      actionId: "action_exec_1",
      executeNow: true,
    });
    assert.equal(result.executed, true);
    assert.match(result.reply || "", /outreach update/i);
    assert.match(result.reply || "", /Ava Chen/);
    assert.match(result.reply || "", /Handoff/i);
  });
});
