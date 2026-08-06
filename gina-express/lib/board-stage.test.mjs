import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  boardActionsFromTask,
  boardColumnKey,
  normalizeBoardStageKey,
  parseBoardStageMoves,
} from "./board-stage.js";

describe("normalizeBoardStageKey", () => {
  it("maps Title Case and aliases to Board keys", () => {
    assert.equal(normalizeBoardStageKey("Rejected"), "rejected");
    assert.equal(normalizeBoardStageKey("reject"), "rejected");
    assert.equal(normalizeBoardStageKey("Phone Screen"), "screening");
    assert.equal(normalizeBoardStageKey("Interview"), "interview");
    assert.equal(normalizeBoardStageKey("interviewing"), "interview");
    assert.equal(normalizeBoardStageKey("Hired"), "hired");
  });
});

describe("parseBoardStageMoves", () => {
  it("parses reject Ivy Kim → rejected", () => {
    const moves = parseBoardStageMoves(
      "Tell Kelley to reject Ivy Kim for Mobility Driver",
    );
    assert.equal(moves.length, 1);
    assert.equal(moves[0].name, "Ivy Kim");
    assert.equal(moves[0].stage, "rejected");
  });

  it("parses advance Ava Foster to interview", () => {
    const moves = parseBoardStageMoves(
      "Tell Kelley to advance Ava Foster to an interview",
    );
    assert.equal(moves.length, 1);
    assert.equal(moves[0].name, "Ava Foster");
    assert.equal(moves[0].stage, "interview");
  });

  it("parses move to Phone Screen", () => {
    const moves = parseBoardStageMoves(
      'Tell Kelley to move "Ava Chen" to Phone Screen',
    );
    assert.ok(moves.some((m) => m.name === "Ava Chen" && m.stage === "screening"));
  });

  it("builds update_stage boardActions with lowercase keys", () => {
    const actions = boardActionsFromTask(
      "reject Ivy Kim and advance Ava Foster to interview",
      { jobTitle: "Mobility Driver" },
    );
    assert.ok(actions.length >= 2);
    assert.ok(actions.every((a) => a.type === "update_stage"));
    assert.ok(actions.every((a) => a.payload.stage === a.payload.stage.toLowerCase()));
  });
});

describe("boardColumnKey", () => {
  it("buckets unknown stages into new", () => {
    assert.equal(boardColumnKey("Rejected"), "rejected");
    assert.equal(boardColumnKey(""), "new");
    assert.equal(boardColumnKey("weird"), "new");
  });
});
