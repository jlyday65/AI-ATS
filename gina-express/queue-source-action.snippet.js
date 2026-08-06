/**
 * Gina: allow chat / Agent to QUEUE a Maria sourcing action.
 *
 * Insert into the same path that inserts create_candidate / update_stage / add_note
 * into ats_actions. Example:
 *
 *   if (type === "source_candidates_signalhire") {
 *     // validate + insert pending row (see below)
 *   }
 *
 * And in the action runner (Check for actions / Maria worker), execute:
 *
 *   import { mariaSourceViaSignalHire } from "./maria-source.tool.js";
 *   if (action.type === "source_candidates_signalhire") {
 *     const result = await mariaSourceViaSignalHire(action.payload);
 *     // mark action done; tell user to Check for actions for import_candidate rows
 *   }
 */

/*
// --- queue (chat agent) ---
async function queueSourceAction(payload) {
  const roleTitle = String(payload.roleTitle || payload.title || "").trim();
  if (!roleTitle) throw new Error("roleTitle required");

  const body = {
    roleTitle,
    location: payload.location || "",
    roleDescription: payload.roleDescription || payload.description || "",
    resumesRequired: payload.resumesRequired !== false,
    pushToGina: payload.pushToGina !== false,
    pushTopN: payload.pushTopN ?? 5,
    requiredSkills: payload.requiredSkills || [],
  };

  const { rows } = await pool.query(
    "INSERT INTO ats_actions (type, payload, status) VALUES ($1, $2, 'pending') RETURNING id",
    ["source_candidates_signalhire", JSON.stringify(body)],
  );
  return rows[0].id;
}

// --- run (Maria / Check for actions) ---
async function runSourceAction(action) {
  const { mariaSourceViaSignalHire } = await import("./maria-source.tool.js");
  const result = await mariaSourceViaSignalHire(action.payload || {});
  await pool.query(
    "UPDATE ats_actions SET status = 'done', result = $2 WHERE id = $1",
    [action.id, JSON.stringify(result)],
  );
  return result;
}
*/
