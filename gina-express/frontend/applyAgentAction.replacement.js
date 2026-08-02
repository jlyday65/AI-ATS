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

  function resolveTeamBotName(raw) {
    const text = String(raw || "").trim().toLowerCase();
    if (!text) return null;
    // "Maria (Sourcer)", "to: maria@", plain "Maria"
    const first = text.split(/[\s(,:@<]/).find(Boolean) || "";
    const key = first.replace(/[^a-z]/g, "");
    if (BOT_NAMES.has(key)) return key === "kelly" ? "kelley" : key;
    for (const bot of BOT_NAMES) {
      if (text === bot || text.startsWith(`${bot} `) || text.includes(` ${bot} `)) {
        return bot === "kelly" ? "kelley" : bot;
      }
    }
    return null;
  }

  function isEmailActionType(type) {
    const t = String(type || "").toLowerCase();
    return (
      t === "send_email" ||
      t === "queue_email" ||
      t === "compose_email" ||
      t === "draft_email" ||
      t === "email" ||
      /email/.test(t)
    );
  }

  async function applyAgentAction(action) {
    const { type, payload } = action;
    try {
      // --- Never email team bots; rewrite to command_agent ---
      if (isEmailActionType(type)) {
        const toRaw =
          payload?.to ||
          payload?.recipient ||
          payload?.toName ||
          payload?.name ||
          payload?.match?.name ||
          payload?.agent ||
          "";
        const bot = resolveTeamBotName(toRaw);
        if (bot && bot !== "gina") {
          const subject = String(payload?.subject || "").trim();
          const body = String(
            payload?.body ||
              payload?.text ||
              payload?.message ||
              payload?.task ||
              "",
          ).trim();
          // Always frame as a status update so Maria does not treat project
          // names like "Home Depot Sourcing" as a source-candidates job.
          const task = [
            "Provide a status update for Kimberley.",
            subject ? `Topic: ${subject}` : "",
            body && body !== subject ? body : "",
            "Do not start a new candidate search unless Kimberley explicitly asked to source.",
          ]
            .filter(Boolean)
            .join(" ");
          const res = await fetch("/ats/run-command", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              type: "command_agent",
              actionId: action.id,
              payload: {
                targetAgent: bot,
                task: String(task),
                requestedBy: "Kimberley",
              },
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data.ok === false) {
            return {
              ok: false,
              reason:
                data.error ||
                `Refused email to ${bot} (team bot). command_agent failed — use Ask ${bot} + Check for actions.`,
            };
          }
          return {
            ok: true,
            summary:
              data.summary ||
              `Did not email ${bot} (internal bot). Ran team command instead — see Kimberley's Notes.`,
          };
        }
      }

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
        const match = findCandidateByMatch({
          ...(payload?.match || {}),
          email: payload?.match?.email || payload?.email || "",
          phone: payload?.match?.phone || payload?.phone || "",
          jobTitle:
            payload?.match?.jobTitle ||
            payload?.match?.role ||
            payload?.jobTitle ||
            payload?.role ||
            "",
        });
        if (!match) return { ok: false, reason: `No candidate found matching ${JSON.stringify(payload?.match)}.` };
        if (match.ambiguous) {
          const emails = match.emails?.length
            ? ` (board emails: ${match.emails.join(", ")})`
            : "";
          return {
            ok: false,
            reason: `${match.count} candidates share that name${emails} — re-queue with match.email, or clear duplicate names on the Board.`,
          };
        }
        if (!STAGES.some((s) => s.key === payload?.stage)) return { ok: false, reason: `"${payload?.stage}" isn't a valid stage.` };
        setStage(match.id, payload.stage);
        return { ok: true, summary: `Moved ${match.name} to ${stageMeta(payload.stage).label}` };
      }

      if (type === "add_note") {
        const match = findCandidateByMatch({
          ...(payload?.match || {}),
          email: payload?.match?.email || payload?.email || "",
          phone: payload?.match?.phone || payload?.phone || "",
          jobTitle:
            payload?.match?.jobTitle ||
            payload?.match?.role ||
            payload?.jobTitle ||
            payload?.role ||
            "",
        });
        if (!match) return { ok: false, reason: `No candidate found matching ${JSON.stringify(payload?.match)}.` };
        if (match.ambiguous) {
          const emails = match.emails?.length
            ? ` (board emails: ${match.emails.join(", ")})`
            : "";
          return {
            ok: false,
            reason: `${match.count} candidates share that name${emails} — re-queue with match.email, or clear duplicate names on the Board.`,
          };
        }
        if (!payload?.text) return { ok: false, reason: "Missing note text in payload." };
        addNote(match.id, payload.text);
        return { ok: true, summary: `Added a note to ${match.name}` };
      }

      return { ok: false, reason: `Unknown action type "${type}".` };
    } catch (e) {
      return { ok: false, reason: e.message || String(e) };
    }
  }
