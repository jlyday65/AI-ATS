/**
 * Clean pipeline briefing text for Gina chat / morning summary.
 *
 * Mount:
 *   import pipelineBriefingRouter from "./routes/pipeline-briefing.js";
 *   app.use("/ats", pipelineBriefingRouter);
 *
 * POST /ats/pipeline-briefing
 *   body: { boardCandidates?, jobs?, stageCounts?, remindersDue?, pipelineDetail?, asOf? }
 *   → { ok, text, teamUpdates }
 *   Jobs rollup uses boardCandidates (+ jobs seed) for:
 *   Job Title, Names in Screening, Names Interviewing, Candidate Hired
 *
 * GET /ats/pipeline-briefing
 *   → same using empty/default stage counts + latest Kimberley Notes
 */

import { Router } from "express";
import { formatMorningPipelineBriefing } from "../briefing/format-pipeline-stage-counts.js";
import { countLiveStageCounts } from "../lib/live-stage-counts.js";
import { kimberleyNotes } from "../lib/kimberley-notes.js";

const router = Router();

async function loadTeamUpdates() {
  try {
    // Prefer briefing-flagged notes; if empty, still surface recent bot replies
    // so Kelley updates always reach Gina's pipeline summary.
    let rows = await kimberleyNotes.listNotes({ limit: 30, briefingOnly: true });
    if (!rows.length) {
      rows = await kimberleyNotes.listNotes({ limit: 30 });
    }
    const bots = new Set([
      "maria",
      "michelle",
      "kelley",
      "kelly",
      "ashton",
      "gina",
    ]);
    const filtered = rows.filter((n) =>
      bots.has(String(n.fromAgent || "").trim().toLowerCase()),
    );
    const use = filtered.length ? filtered : rows;
    return use.map((n) => ({
      from: n.fromAgent,
      role: n.agentRole,
      task: n.task,
      reply: n.reply,
      at: n.createdAt,
      includeInBriefing: n.includeInBriefing !== false,
    }));
  } catch {
    return [];
  }
}

function normalizeCounts(raw = {}) {
  const out = {};
  for (const [k, v] of Object.entries(raw || {})) {
    const key = String(k).trim().toLowerCase();
    out[key] = Number(v) || 0;
  }
  return out;
}

async function build(body = {}) {
  const boardCandidates =
    body.boardCandidates || body.candidates || body.board || null;
  const stageCounts = Array.isArray(boardCandidates)
    ? normalizeCounts(countLiveStageCounts(boardCandidates))
    : normalizeCounts(body.stageCounts || body.stage_counts || {});
  const teamUpdates = Array.isArray(body.teamUpdates)
    ? body.teamUpdates
    : await loadTeamUpdates();
  const jobs = body.jobs || body.jobList || body.openJobs || [];
  const text = formatMorningPipelineBriefing({
    stageCounts,
    boardCandidates: Array.isArray(boardCandidates) ? boardCandidates : null,
    remindersDue: body.remindersDue || body.reminders_due || [],
    pipelineDetail: body.pipelineDetail || body.pipeline_detail || [],
    teamUpdates,
    jobs: Array.isArray(jobs) ? jobs : [],
    asOf: body.asOf || body.as_of || new Date().toLocaleString("en-US", {
      timeZone: "America/New_York",
    }),
  });
  return { text, teamUpdates, stageCounts };
}

router.get("/pipeline-briefing", async (req, res) => {
  try {
    const result = await build({
      stageCounts: {
        new: req.query.new,
        screening: req.query.screening,
        interview: req.query.interview,
        offer: req.query.offer,
        hired: req.query.hired,
        rejected: req.query.rejected,
      },
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

router.post("/pipeline-briefing", async (req, res) => {
  try {
    const result = await build(req.body || {});
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

export default router;
