/**
 * Add this route to Gina: routes/ats.js
 * Place it with the other router.post handlers (after requireRelaySecret import).
 *
 * SignalHire will call: POST /ats/import-candidates
 * Headers: X-Relay-Secret: <RELAY_SECRET>  (or Authorization: Bearer <RELAY_SECRET>)
 *
 * Creates pending rows in ats_actions for the ATS UI "Check for actions" flow.
 */

/*
router.post("/import-candidates", requireRelaySecret, async (req, res) => {
  const { jobTitle, jobId, candidates, source } = req.body || {};
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return res.status(400).json({ error: "Missing 'candidates' array" });
  }

  try {
    const ids = [];
    for (const c of candidates) {
      const payload = {
        name: c.name || c.fullName || "",
        email: c.email || "",
        phone: c.phone || "",
        // Prefer the requisition title for board "role"; keep headline separately
        role: jobTitle || c.jobTitle || c.role || c.title || "",
        headline: c.headline || c.title || "",
        resumeText: c.resumeText || c.summary || c.notes || "",
        summary: c.summary || "",
        jobTitle: jobTitle || c.jobTitle || "",
        jobId: jobId || "",
        source: source || c.source || "signalhire",
        skills: c.skills || [],
        linkedProfiles: c.linkedProfiles || c.profiles || [],
        tags: c.tags || ["signalhire", "ai-sourced"],
      };

      const { rows } = await pool.query(
        "INSERT INTO ats_actions (type, payload, status) VALUES ($1, $2, 'pending') RETURNING id",
        ["import_candidate", JSON.stringify(payload)],
      );
      ids.push(rows[0].id);
    }

    res.json({ ok: true, ids, count: ids.length });
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});
*/
