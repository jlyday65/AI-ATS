/**
 * In Gina: frontend/src/App.jsx (or frontend/App.jsx)
 *
 * Find:  function applyAgentAction(action) {
 * Replace the ENTIRE function (through its closing `}`) with this.
 *
 * IMPORTANT: "Check for actions" must `await applyAgentAction(action)` —
 * command_agent / Maria sourcing are async (call /ats/run-command).
 *
 * Fixes: Skipped action N: No candidate found matching {"name":"Maria"}
 * (Maria is a bot, not a candidate.)
 */

  const BOT_NAMES = new Set(["maria", "michelle", "kelley", "kelly", "ashton", "gina"]);

  function isBotMatch(match) {
    const name = String(match?.name || match?.fullName || "").trim().toLowerCase();
    return Boolean(name) && BOT_NAMES.has(name);
  }

  async function applyAgentAction(action) {
    const { type, payload } = action;
    try {
      // --- Team commands (Kimberley → Gina → Maria/Michelle/Kelley/Ashton) ---
      if (type === "command_agent" || type === "source_candidates_signalhire" || type === "create_candidate_file") {
        const res = await fetch("/ats/run-command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            type,
            actionId: action.id,
            payload: payload || {},
            action, // full queued row — helps infer roleTitle from task text
            summary: action.summary || action.detail || action.notes || "",
            taskHint: [
              action.summary,
              action.detail,
              action.notes,
              action.description,
              action.task,
              typeof action.payload === "string"
                ? action.payload
                : JSON.stringify(action.payload || {}),
              typeof payload === "string" ? payload : JSON.stringify(payload || {}),
            ]
              .filter(Boolean)
              .join("\n"),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) {
          const dbg = data.debug ? ` | debug: ${JSON.stringify(data.debug)}` : "";
          return {
            ok: false,
            reason:
              (data.error ||
                data.reason ||
                data.summary ||
                data.message ||
                data.result?.error ||
                `Command failed (${res.status})`) + dbg,
          };
        }
        return {
          ok: true,
          summary:
            data.summary ||
            (data.reply
              ? `${data.result?.agent || "Team"} replied — see Kimberley's Notes`
              : "Team command executed"),
          kimberleyNoteId: data.kimberleyNoteId || null,
          reply: data.reply || null,
        };
      }

      // Mis-queued bot names as candidate match (legacy Gina chat behavior)
      if (
        (type === "update_stage" || type === "add_note") &&
        isBotMatch(payload?.match)
      ) {
        const bot = String(payload.match.name || "").trim();
        const task =
          payload.text ||
          payload.task ||
          payload.note ||
          `Command for ${bot}`;
        const res = await fetch("/ats/run-command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            type: "command_agent",
            actionId: action.id,
            payload: {
              targetAgent: bot,
              task,
              requestedBy: "Kimberley",
              resumesRequired: /resume/i.test(String(task)),
            },
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) {
          return {
            ok: false,
            reason:
              data.error ||
              `Action looked like a command for bot ${bot}, but /ats/run-command failed. Mount routes/run-command.js and set SIGNALHIRE_BASE_URL.`,
          };
        }
        return {
          ok: true,
          summary: data.summary || `Ran command for ${bot}`,
        };
      }

      if (type === "create_candidate" || type === "import_candidate") {
        if (!payload?.name) return { ok: false, reason: "Missing candidate name in payload." };

        const email = (payload.email || "").trim().toLowerCase();
        const name = (payload.name || "").trim().toLowerCase();
        const existing = candidates.find((c) => {
          if (email && (c.email || "").trim().toLowerCase() === email) return true;
          if (name && (c.name || "").trim().toLowerCase() === name) return true;
          return false;
        });
        if (existing) {
          // Merge resume/role onto the existing card (old imports often only had summary).
          // Gina's CandidateTracker has setCandidates — not updateCandidate.
          const resumeText =
            payload.resumeText || payload.resume_text || payload.summary || "";
          const role = payload.jobTitle || payload.role || existing.role || "";
          const patch = {
            resumeText: resumeText || existing.resumeText || existing.resume_text || "",
            summary: payload.summary || existing.summary || "",
            headline: payload.headline || existing.headline || "",
            role,
            jobTitle: payload.jobTitle || existing.jobTitle || "",
            source: existing.source || payload.source || "SignalHire",
          };
          if (typeof updateCandidate === "function") {
            updateCandidate(existing.id, patch);
          } else if (typeof setCandidates === "function") {
            setCandidates((prev) =>
              (prev || []).map((c) =>
                c.id === existing.id ? { ...c, ...patch } : c,
              ),
            );
          } else {
            return {
              ok: false,
              reason: `Duplicate ${existing.name} found but board has no setCandidates/updateCandidate to merge resume.`,
            };
          }
          return {
            ok: true,
            summary: `Updated ${existing.name} with resume/role from import`,
          };
        }

        let jobId = payload.jobId || null;
        if (!jobId && payload.jobTitle) {
          const job = jobs.find(
            (j) => (j.title || "").trim().toLowerCase() === String(payload.jobTitle).trim().toLowerCase()
          );
          if (job) jobId = job.id;
        }

        addCandidate({
          name: payload.name,
          // Board role = job title (not demo headline like "mid-senior X · skills")
          role: payload.jobTitle || payload.role || "",
          email: payload.email || "",
          phone: payload.phone || "",
          source: payload.source || (type === "import_candidate" ? "SignalHire" : "Gina"),
          resumeText: payload.resumeText || payload.resume_text || "",
          summary: payload.summary || "",
          headline: payload.headline || "",
          jobId,
          jobTitle: payload.jobTitle || "",
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
