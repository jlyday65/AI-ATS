/**
 * Kimberley Notes — team bot replies for Maria / Michelle / Kelley / Ashton.
 *
 * Drop into Gina next to routes/. Uses Postgres when `pool` is available;
 * otherwise persists to a JSON file so the panel still works.
 *
 * Table (optional — auto-used when present):
 *   CREATE TABLE IF NOT EXISTS kimberley_notes (
 *     id SERIAL PRIMARY KEY,
 *     from_agent TEXT NOT NULL,
 *     agent_role TEXT,
 *     task TEXT NOT NULL,
 *     reply TEXT NOT NULL,
 *     action_id TEXT,
 *     requested_by TEXT DEFAULT 'Kimberley',
 *     status TEXT DEFAULT 'unread',
 *     include_in_briefing BOOLEAN DEFAULT TRUE,
 *     created_at TIMESTAMPTZ DEFAULT NOW()
 *   );
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

const FILE_STORE = path.join(process.cwd(), ".data", "kimberley-notes.json");

function loadFile() {
  try {
    if (!existsSync(FILE_STORE)) return [];
    const raw = JSON.parse(readFileSync(FILE_STORE, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveFile(rows) {
  try {
    const dir = path.dirname(FILE_STORE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(FILE_STORE, JSON.stringify(rows, null, 2), "utf8");
  } catch {
    // in-memory still usable for the process
  }
}

let memory = loadFile();

function normalizeRow(row) {
  return {
    id: row.id ?? row.note_id,
    fromAgent: row.fromAgent || row.from_agent || "",
    agentRole: row.agentRole || row.agent_role || "",
    task: row.task || "",
    reply: row.reply || "",
    actionId: row.actionId ?? row.action_id ?? null,
    requestedBy: row.requestedBy || row.requested_by || "Kimberley",
    status: row.status || "unread",
    includeInBriefing:
      row.includeInBriefing ?? row.include_in_briefing ?? true,
    createdAt: row.createdAt || row.created_at || new Date().toISOString(),
  };
}

/**
 * @param {{ pool?: import("pg").Pool }} [deps]
 */
export function createKimberleyNotes(deps = {}) {
  const pool = deps.pool || null;

  async function insertNote(input = {}) {
    const row = normalizeRow({
      id: `note_${randomUUID().slice(0, 8)}`,
      fromAgent: input.fromAgent || input.agent || "gina",
      agentRole: input.agentRole || input.role || "",
      task: String(input.task || "").trim(),
      reply: String(input.reply || "").trim(),
      actionId: input.actionId ?? input.action_id ?? null,
      requestedBy: input.requestedBy || "Kimberley",
      status: input.status || "unread",
      includeInBriefing: input.includeInBriefing !== false,
      createdAt: new Date().toISOString(),
    });
    if (!row.task || !row.reply) {
      throw new Error("kimberley note requires task and reply");
    }

    if (pool) {
      try {
        const { rows } = await pool.query(
          `INSERT INTO kimberley_notes
            (from_agent, agent_role, task, reply, action_id, requested_by, status, include_in_briefing)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           RETURNING id, from_agent, agent_role, task, reply, action_id, requested_by, status,
                     include_in_briefing, created_at`,
          [
            row.fromAgent,
            row.agentRole,
            row.task,
            row.reply,
            row.actionId,
            row.requestedBy,
            row.status,
            row.includeInBriefing,
          ],
        );
        return normalizeRow(rows[0]);
      } catch (err) {
        // Table may not exist yet — fall through to file store.
        if (!/kimberley_notes|does not exist/i.test(String(err?.message || err))) {
          throw err;
        }
      }
    }

    memory = [row, ...memory].slice(0, 500);
    saveFile(memory);
    return row;
  }

  async function listNotes({ limit = 50, status, agent, briefingOnly } = {}) {
    if (pool) {
      try {
        const clauses = [];
        const params = [];
        if (status) {
          params.push(status);
          clauses.push(`status = $${params.length}`);
        }
        if (agent) {
          params.push(String(agent).toLowerCase());
          clauses.push(`lower(from_agent) = $${params.length}`);
        }
        if (briefingOnly) {
          clauses.push(`include_in_briefing = TRUE`);
        }
        const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
        params.push(Math.min(Number(limit) || 50, 200));
        const { rows } = await pool.query(
          `SELECT id, from_agent, agent_role, task, reply, action_id, requested_by, status,
                  include_in_briefing, created_at
           FROM kimberley_notes
           ${where}
           ORDER BY created_at DESC
           LIMIT $${params.length}`,
          params,
        );
        return rows.map(normalizeRow);
      } catch {
        // fall through
      }
    }

    let rows = [...memory];
    if (status) rows = rows.filter((r) => r.status === status);
    if (agent) {
      const key = String(agent).toLowerCase();
      rows = rows.filter((r) => r.fromAgent.toLowerCase() === key);
    }
    if (briefingOnly) rows = rows.filter((r) => r.includeInBriefing);
    return rows.slice(0, Math.min(Number(limit) || 50, 200));
  }

  async function markStatus(id, status) {
    if (pool) {
      try {
        const { rows } = await pool.query(
          `UPDATE kimberley_notes SET status = $2 WHERE id::text = $1
           RETURNING id, from_agent, agent_role, task, reply, action_id, requested_by, status,
                     include_in_briefing, created_at`,
          [String(id), status],
        );
        if (rows[0]) return normalizeRow(rows[0]);
      } catch {
        // fall through
      }
    }
    memory = memory.map((r) =>
      String(r.id) === String(id) ? { ...r, status } : r,
    );
    saveFile(memory);
    return memory.find((r) => String(r.id) === String(id)) || null;
  }

  /**
   * Replace an ack note for the same ats_actions id, or insert if none.
   * Keeps Kimberley's Notes to one working update per Check-for-actions run.
   */
  async function upsertByActionId(actionId, input = {}) {
    const key = String(actionId || "").trim();
    if (!key) return insertNote(input);

    if (pool) {
      try {
        const existing = await pool.query(
          `SELECT id FROM kimberley_notes WHERE action_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [key],
        );
        if (existing.rows[0]) {
          const { rows } = await pool.query(
            `UPDATE kimberley_notes
               SET from_agent = $2, agent_role = $3, task = $4, reply = $5,
                   requested_by = $6, status = 'unread', include_in_briefing = $7
             WHERE id = $1
             RETURNING id, from_agent, agent_role, task, reply, action_id, requested_by, status,
                       include_in_briefing, created_at`,
            [
              existing.rows[0].id,
              input.fromAgent || input.agent || "gina",
              input.agentRole || input.role || "",
              String(input.task || "").trim(),
              String(input.reply || "").trim(),
              input.requestedBy || "Kimberley",
              input.includeInBriefing !== false,
            ],
          );
          if (rows[0]) return normalizeRow(rows[0]);
        }
      } catch {
        // fall through to file store
      }
    }

    const idx = memory.findIndex((r) => String(r.actionId) === key);
    if (idx >= 0) {
      const updated = normalizeRow({
        ...memory[idx],
        fromAgent: input.fromAgent || input.agent || memory[idx].fromAgent,
        agentRole: input.agentRole || input.role || memory[idx].agentRole,
        task: String(input.task || "").trim() || memory[idx].task,
        reply: String(input.reply || "").trim() || memory[idx].reply,
        actionId: key,
        requestedBy: input.requestedBy || memory[idx].requestedBy || "Kimberley",
        status: "unread",
        includeInBriefing: input.includeInBriefing !== false,
        createdAt: memory[idx].createdAt,
      });
      memory = [...memory];
      memory[idx] = updated;
      saveFile(memory);
      return updated;
    }

    return insertNote({ ...input, actionId: key });
  }

  return { insertNote, listNotes, markStatus, upsertByActionId };
}

/** Default singleton (file-backed). Gina can re-bind with pool. */
export const kimberleyNotes = createKimberleyNotes();

export default kimberleyNotes;
