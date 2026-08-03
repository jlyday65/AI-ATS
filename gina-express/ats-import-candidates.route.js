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
    // Dedupe before queueing — never create Omar Sato × N pending actions.
    const seen = new Set();
    const unique = [];
    for (const c of candidates) {
      const email = String(c.email || "").trim().toLowerCase();
      const phone = String(c.phone || "").replace(/\D/g, "");
      const name = String(c.name || c.fullName || "").trim().toLowerCase();
      const keys = [
        email ? `e:${email}` : "",
        phone.length >= 7 ? `p:${phone}` : "",
        name ? `n:${name}` : "",
      ].filter(Boolean);
      if (!keys.length || keys.some((k) => seen.has(k))) continue;
      for (const k of keys) seen.add(k);
      unique.push(c);
    }

    const ids = [];
    for (const c of unique) {
      const sourcedFrom = Array.isArray(c.sourcedFrom)
        ? c.sourcedFrom
        : Array.isArray(c.platformIds)
          ? c.platformIds
          : [];
      const sourcedFromText =
        c.sourcedFromText ||
        (sourcedFrom.length ? sourcedFrom.join(" · ") : "") ||
        source ||
        c.source ||
        "SignalHire";
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
        source: sourcedFromText,
        sourcedFrom,
        sourcedFromText,
        platforms: c.platforms || c.linkedProfiles || c.profiles || [],
        platformIds: c.platformIds || [],
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

    res.json({ ok: true, ids, count: ids.length, dedupedFrom: candidates.length });
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});
*/
