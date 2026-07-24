/**
 * In Gina: frontend/App.jsx
 *
 * Find:  function applyAgentAction(action) {
 * Replace the ENTIRE function (through its closing `}`) with this:
 *
 * Skips import/create when email or exact name already exists, and still
 * returns ok so "Check for actions" can ack/clear the queued duplicate.
 */

  function applyAgentAction(action) {
    const { type, payload } = action;
    try {
      if (type === "create_candidate" || type === "import_candidate") {
        if (!payload?.name) return { ok: false, reason: "Missing candidate name in payload." };

        const email = (payload.email || "").trim().toLowerCase();
        const name = (payload.name || "").trim().toLowerCase();
        const existing = candidates.find((c) => {
          if (email && c.email.trim().toLowerCase() === email) return true;
          if (name && c.name.trim().toLowerCase() === name) return true;
          return false;
        });
        if (existing) {
          // ok:true so the action is acknowledged/cleared and not re-applied forever
          return {
            ok: true,
            summary: `Skipped duplicate: ${payload.name} (already on board as ${existing.name})`,
          };
        }

        // Prefer matching a local job by title when SignalHire sends jobTitle
        let jobId = payload.jobId || null;
        if (!jobId && payload.jobTitle) {
          const job = jobs.find(
            (j) => (j.title || "").trim().toLowerCase() === String(payload.jobTitle).trim().toLowerCase()
          );
          if (job) jobId = job.id;
        }

        addCandidate({
          name: payload.name,
          role: payload.role || payload.jobTitle || "",
          email: payload.email || "",
          phone: payload.phone || "",
          source: payload.source || (type === "import_candidate" ? "SignalHire" : "Gina"),
          resumeText: payload.resumeText || "",
          jobId,
        });
        return { ok: true, summary: `Created candidate: ${payload.name}` };
      }
      if (type === "update_stage") {
        const match = findCandidateByMatch(payload?.match);
        if (!match) return { ok: false, reason: `No candidate found matching ${JSON.stringify(payload?.match)}.` };
        if (match.ambiguous) return { ok: false, reason: `${match.count} candidates share that name — ask Gina to match by email instead.` };
        if (!STAGES.some((s) => s.key === payload?.stage)) return { ok: false, reason: `"${payload?.stage}" isn't a valid stage.` };
        setStage(match.id, payload.stage);
        return { ok: true, summary: `Moved ${match.name} to ${stageMeta(payload.stage).label}` };
      }
      if (type === "add_note") {
        const match = findCandidateByMatch(payload?.match);
        if (!match) return { ok: false, reason: `No candidate found matching ${JSON.stringify(payload?.match)}.` };
        if (match.ambiguous) return { ok: false, reason: `${match.count} candidates share that name — ask Gina to match by email instead.` };
        if (!payload?.text) return { ok: false, reason: "Missing note text in payload." };
        addNote(match.id, payload.text);
        return { ok: true, summary: `Added a note to ${match.name}` };
      }
      return { ok: false, reason: `Unknown action type "${type}".` };
    } catch (e) {
      return { ok: false, reason: e.message || String(e) };
    }
  }
