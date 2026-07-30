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

/** Coerce queueAction return / ats_actions id into a stable string key. */
export function normalizeActionId(value) {
  if (value == null || value === "") return "";
  if (typeof value === "object") {
    const inner = value.id ?? value.actionId ?? value.action_id ?? null;
    if (inner == null || inner === "") return "";
    return String(inner).trim();
  }
  return String(value).trim();
}

/** Keep newest row per actionId; rows without actionId are kept as-is. */
export function collapseNotesByActionId(rows = []) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = normalizeActionId(row.actionId ?? row.action_id);
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(row);
  }
  return out;
}

/**
 * @param {{ pool?: import("pg").Pool }} [deps]
 */
export function createKimberleyNotes(deps = {}) {
  const pool = deps.pool || null;

  async function insertNote(input = {}) {
    const actionId = normalizeActionId(input.actionId ?? input.action_id) || null;
    const row = normalizeRow({
      id: `note_${randomUUID().slice(0, 8)}`,
      fromAgent: input.fromAgent || input.agent || "gina",
      agentRole: input.agentRole || input.role || "",
      task: String(input.task || "").trim(),
      reply: String(input.reply || "").trim(),
      actionId,
      requestedBy: input.requestedBy || "Kimberley",
      status: input.status || "unread",
      includeInBriefing: input.includeInBriefing !== false,
      createdAt: new Date().toISOString(),
    });
    if (!row.task || !row.reply) {
      throw new Error("kimberley note requires task and reply");
    }

    // Prefer upsert when an actionId is present — prevents ack + execute duplicates.
    if (row.actionId) {
      return upsertByActionId(row.actionId, {
        fromAgent: row.fromAgent,
        agentRole: row.agentRole,
        task: row.task,
        reply: row.reply,
        requestedBy: row.requestedBy,
        includeInBriefing: row.includeInBriefing,
        status: row.status,
      });
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
          if (/^kell[ey]+$/.test(String(agent).toLowerCase())) {
            clauses.push(
              `(lower(from_agent) = 'kelley' OR lower(from_agent) = 'kelly' OR lower(from_agent) = $${params.length})`,
            );
          } else {
            clauses.push(`lower(from_agent) = $${params.length}`);
          }
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
        return collapseNotesByActionId(rows.map(normalizeRow));
      } catch {
        // fall through
      }
    }

    let rows = [...memory];
    if (status) rows = rows.filter((r) => r.status === status);
    if (agent) {
      const key = String(agent).toLowerCase();
      rows = rows.filter((r) => {
        const from = r.fromAgent.toLowerCase();
        if (/^kell[ey]+$/.test(key)) return from === "kelley" || from === "kelly";
        return from === key;
      });
    }
    if (briefingOnly) rows = rows.filter((r) => r.includeInBriefing);
    return collapseNotesByActionId(rows).slice(
      0,
      Math.min(Number(limit) || 50, 200),
    );
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
   * Always collapses extra rows that share the same action_id.
   */
  async function upsertByActionId(actionId, input = {}) {
    const key = normalizeActionId(actionId);
    if (!key) return insertNote({ ...input, actionId: null });

    const fromAgent = input.fromAgent || input.agent || "gina";
    const agentRole = input.agentRole || input.role || "";
    const task = String(input.task || "").trim();
    const reply = String(input.reply || "").trim();
    const requestedBy = input.requestedBy || "Kimberley";
    const includeInBriefing = input.includeInBriefing !== false;
    if (!task || !reply) {
      throw new Error("kimberley note requires task and reply");
    }

    if (pool) {
      try {
        const existing = await pool.query(
          `SELECT id FROM kimberley_notes
           WHERE action_id::text = $1
           ORDER BY created_at DESC
           LIMIT 1`,
          [key],
        );

        let kept;
        if (existing.rows[0]) {
          const { rows } = await pool.query(
            `UPDATE kimberley_notes
               SET from_agent = $2, agent_role = $3, task = $4, reply = $5,
                   requested_by = $6, status = 'unread', include_in_briefing = $7,
                   action_id = $8
             WHERE id = $1
             RETURNING id, from_agent, agent_role, task, reply, action_id, requested_by, status,
                       include_in_briefing, created_at`,
            [
              existing.rows[0].id,
              fromAgent,
              agentRole,
              task,
              reply,
              requestedBy,
              includeInBriefing,
              key,
            ],
          );
          kept = rows[0] ? normalizeRow(rows[0]) : null;
        } else {
          const { rows } = await pool.query(
            `INSERT INTO kimberley_notes
              (from_agent, agent_role, task, reply, action_id, requested_by, status, include_in_briefing)
             VALUES ($1,$2,$3,$4,$5,$6,'unread',$7)
             RETURNING id, from_agent, agent_role, task, reply, action_id, requested_by, status,
                       include_in_briefing, created_at`,
            [
              fromAgent,
              agentRole,
              task,
              reply,
              key,
              requestedBy,
              includeInBriefing,
            ],
          );
          kept = rows[0] ? normalizeRow(rows[0]) : null;
        }

        if (kept) {
          await pool.query(
            `DELETE FROM kimberley_notes
             WHERE action_id::text = $1 AND id::text <> $2`,
            [key, String(kept.id)],
          );
          return kept;
        }
      } catch (err) {
        if (!/kimberley_notes|does not exist/i.test(String(err?.message || err))) {
          // fall through to file store for missing-table; rethrow others
          if (!/does not exist/i.test(String(err?.message || err))) {
            throw err;
          }
        }
      }
    }

    const updated = normalizeRow({
      id: `note_${randomUUID().slice(0, 8)}`,
      fromAgent,
      agentRole,
      task,
      reply,
      actionId: key,
      requestedBy,
      status: "unread",
      includeInBriefing,
      createdAt: new Date().toISOString(),
    });
    const prior = memory.find((r) => normalizeActionId(r.actionId) === key);
    if (prior) {
      updated.id = prior.id;
      updated.createdAt = prior.createdAt;
    }
    memory = [updated, ...memory.filter((r) => normalizeActionId(r.actionId) !== key)].slice(
      0,
      500,
    );
    saveFile(memory);
    return updated;
  }

  /** One-shot cleanup of historical duplicates (same action_id). */
  async function dedupeByActionId() {
    let removed = 0;
    if (pool) {
      try {
        const { rowCount } = await pool.query(
          `DELETE FROM kimberley_notes a
           USING kimberley_notes b
           WHERE a.action_id IS NOT NULL
             AND a.action_id::text = b.action_id::text
             AND a.action_id::text <> ''
             AND a.created_at < b.created_at`,
        );
        removed = rowCount || 0;
        return { ok: true, removed, store: "postgres" };
      } catch {
        // fall through
      }
    }

    const before = memory.length;
    memory = collapseNotesByActionId(memory);
    removed = before - memory.length;
    saveFile(memory);
    return { ok: true, removed, store: "file" };
  }

  return {
    insertNote,
    listNotes,
    markStatus,
    upsertByActionId,
    dedupeByActionId,
  };
}

/** Default singleton (file-backed). Gina can re-bind with pool. */
export const kimberleyNotes = createKimberleyNotes();

export default kimberleyNotes;
