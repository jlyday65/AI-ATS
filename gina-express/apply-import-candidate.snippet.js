/**
 * Gina is queuing SignalHire rows as ats_actions.type = "import_candidate",
 * but the "Check for actions" applicator does not handle that type yet.
 *
 * Find the skip message source:
 *   grep -rn "Unknown action type" .
 *
 * Then add a case for "import_candidate" next to the other action types
 * (add_candidate / create_candidate / stage_change / note / etc.).
 *
 * Adjust table/column names to match your Gina schema.
 */

/*
// --- Example: inside your applyAction(action) switch ---

case "import_candidate": {
  const p = typeof action.payload === "string"
    ? JSON.parse(action.payload)
    : (action.payload || {});

  const name = p.name || p.fullName || "Unknown";
  const email = p.email || null;
  const phone = p.phone || null;
  const role = p.role || p.title || p.headline || null;
  const resumeText = p.resumeText || p.summary || p.notes || null;
  const source = p.source || "signalhire";
  const jobTitle = p.jobTitle || null;
  const jobId = p.jobId || null;

  // Prefer your real candidates insert. Common patterns:

  // A) candidates table
  const { rows } = await pool.query(
    `INSERT INTO candidates (name, email, phone, role, resume_text, source, job_title, job_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     RETURNING id`,
    [name, email, phone, role, resumeText, source, jobTitle, jobId],
  );

  // B) if your ATS uses a different shape, map into that instead of skipping.

  await pool.query(
    `UPDATE ats_actions SET status = 'done', result = $2, updated_at = NOW() WHERE id = $1`,
    [action.id, JSON.stringify({ candidateId: rows[0].id, name })],
  );

  return { ok: true, candidateId: rows[0].id, name };
}

default:
  // keep your existing:
  // console.log(`Skipped action ${action.id}: Unknown action type "${action.type}".`);
  return { ok: false, skipped: true, reason: `Unknown action type "${action.type}"` };
*/
