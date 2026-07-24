/**
 * Optional Gina upgrade: upsert candidate by email when SignalHire pushes
 * a resume (import_candidate with resumeText).
 *
 * Place beside your existing import_candidate / create_candidate handler.
 */

/*
case "import_candidate": {
  const p = typeof action.payload === "string"
    ? JSON.parse(action.payload)
    : (action.payload || {});

  const name = p.name || p.fullName || "Unknown";
  const email = (p.email || "").trim().toLowerCase() || null;
  const phone = p.phone || null;
  const role = p.role || p.title || p.headline || null;
  const resumeText = p.resumeText || p.summary || p.notes || null;
  const source = p.source || "signalhire";
  const jobTitle = p.jobTitle || null;
  const jobId = p.jobId || null;

  let candidateId = null;

  if (email) {
    const { rows: existing } = await pool.query(
      "SELECT id FROM candidates WHERE lower(email) = $1 LIMIT 1",
      [email],
    );
    if (existing[0]) {
      candidateId = existing[0].id;
      await pool.query(
        `UPDATE candidates
         SET name = COALESCE($2, name),
             phone = COALESCE($3, phone),
             role = COALESCE($4, role),
             resume_text = COALESCE($5, resume_text),
             job_title = COALESCE($6, job_title),
             job_id = COALESCE($7, job_id),
             source = COALESCE($8, source),
             updated_at = NOW()
         WHERE id = $1`,
        [candidateId, name, phone, role, resumeText, jobTitle, jobId, source],
      );
    }
  }

  if (!candidateId) {
    const { rows } = await pool.query(
      `INSERT INTO candidates (name, email, phone, role, resume_text, source, job_title, job_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING id`,
      [name, email, phone, role, resumeText, source, jobTitle, jobId],
    );
    candidateId = rows[0].id;
  }

  // Optional: link application to job if you have an applications table
  // await pool.query(
  //   `INSERT INTO applications (candidate_id, job_id, status, source, created_at)
  //    VALUES ($1, $2, 'new', $3, NOW())
  //    ON CONFLICT DO NOTHING`,
  //   [candidateId, jobId, source],
  // );

  await pool.query(
    `UPDATE ats_actions SET status = 'done', result = $2, updated_at = NOW() WHERE id = $1`,
    [action.id, JSON.stringify({ candidateId, name, email, resumeAttached: Boolean(resumeText) })],
  );

  return { ok: true, candidateId, name };
}
*/
