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
 *
 * No duplicate Board cards: import session keys survive React stale state
 * during a multi-import "Check for actions" batch; existing dupes collapse.
 */

  function personDedupeKeys(person = {}) {
    const keys = [];
    const email = String(person.email || "").trim().toLowerCase();
    if (email) keys.push(`e:${email}`);
    const phone = String(person.phone || "").replace(/\D/g, "");
    if (phone.length >= 7) keys.push(`p:${phone}`);
    const name = String(person.name || person.fullName || "")
      .trim()
      .toLowerCase();
    if (name) keys.push(`n:${name}`);
    return keys;
  }

  function sameBoardPerson(a = {}, b = {}) {
    const ae = String(a.email || "").trim().toLowerCase();
    const be = String(b.email || "").trim().toLowerCase();
    if (ae && be && ae === be) return true;
    const ap = String(a.phone || "").replace(/\D/g, "");
    const bp = String(b.phone || "").replace(/\D/g, "");
    if (ap.length >= 7 && bp.length >= 7 && ap === bp) return true;
    const an = String(a.name || a.fullName || "")
      .trim()
      .toLowerCase();
    const bn = String(b.name || b.fullName || "")
      .trim()
      .toLowerCase();
    return Boolean(an && bn && an === bn);
  }

  function beginCandidateImportSession() {
    const keys = new Set();
    const list =
      typeof candidates !== "undefined" && Array.isArray(candidates)
        ? candidates
        : typeof window !== "undefined" && Array.isArray(window.__ginaBoardCandidates)
          ? window.__ginaBoardCandidates
          : [];
    for (const c of list) {
      for (const k of personDedupeKeys(c)) keys.add(k);
    }
    if (typeof window !== "undefined") {
      window.__ginaImportDedupeKeys = keys;
    }
    return keys;
  }

  function importSessionKeys() {
    if (
      typeof window !== "undefined" &&
      window.__ginaImportDedupeKeys instanceof Set
    ) {
      return window.__ginaImportDedupeKeys;
    }
    return beginCandidateImportSession();
  }

  function rememberImportPerson(person) {
    const session = importSessionKeys();
    for (const k of personDedupeKeys(person)) session.add(k);
  }

  function sessionHasPerson(person) {
    const session = importSessionKeys();
    return personDedupeKeys(person).some((k) => session.has(k));
  }

  /** Collapse any existing duplicate Board cards (keep richest resume). */
  function dedupeBoardCandidates() {
    if (typeof setCandidates !== "function") return 0;
    let removed = 0;
    setCandidates((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      if (typeof window !== "undefined") window.__ginaBoardCandidates = list;
      const out = [];
      for (const c of list) {
        const idx = out.findIndex((x) => sameBoardPerson(x, c));
        if (idx < 0) {
          out.push(c);
          continue;
        }
        removed += 1;
        const prevC = out[idx];
        const prevLen = String(
          prevC.resumeText || prevC.resume_text || prevC.summary || "",
        ).length;
        const nextLen = String(
          c.resumeText || c.resume_text || c.summary || "",
        ).length;
        const keepPrev = prevLen >= nextLen;
        const base = keepPrev ? prevC : c;
        const other = keepPrev ? c : prevC;
        out[idx] = {
          ...other,
          ...base,
          id: prevC.id,
          email: base.email || other.email || "",
          phone: base.phone || other.phone || "",
          resumeText:
            base.resumeText ||
            base.resume_text ||
            other.resumeText ||
            other.resume_text ||
            "",
          summary: base.summary || other.summary || "",
          role: base.role || other.role || "",
          jobTitle: base.jobTitle || other.jobTitle || "",
          source: base.source || other.source || "",
        };
      }
      if (typeof window !== "undefined") window.__ginaBoardCandidates = out;
      return out;
    });
    beginCandidateImportSession();
    return removed;
  }

  // Expose for Check for actions even if call sites sit in another closure.
  if (typeof window !== "undefined") {
    window.beginCandidateImportSession = beginCandidateImportSession;
    window.dedupeBoardCandidates = dedupeBoardCandidates;
  }

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

        // Prefer functional setCandidates so batch imports cannot create
        // Omar Sato × N from React stale `candidates` closures.
        const resumeText =
          payload.resumeText || payload.resume_text || payload.summary || "";
        let jobId = payload.jobId || null;
        if (!jobId && payload.jobTitle) {
          const job = (Array.isArray(jobs) ? jobs : []).find(
            (j) =>
              (j.title || "").trim().toLowerCase() ===
              String(payload.jobTitle).trim().toLowerCase(),
          );
          if (job) jobId = job.id;
        }
        const sourcedFrom = Array.isArray(payload.sourcedFrom)
          ? payload.sourcedFrom
          : Array.isArray(payload.platformIds)
            ? payload.platformIds
            : [];
        const sourcedFromText =
          payload.sourcedFromText ||
          (sourcedFrom.length ? sourcedFrom.join(" · ") : "") ||
          payload.source ||
          (type === "import_candidate" ? "SignalHire" : "Gina");
        const education =
          payload.education ||
          payload.educationText ||
          "";
        const incoming = {
          name: payload.name,
          email: payload.email || "",
          phone: payload.phone || "",
          role: payload.jobTitle || payload.role || "",
          jobTitle: payload.jobTitle || "",
          resumeText,
          summary: payload.summary || "",
          headline: payload.headline || "",
          education,
          source: sourcedFromText,
          sourcedFrom,
          sourcedFromText,
          platforms: payload.platforms || payload.linkedProfiles || [],
          platformIds: payload.platformIds || [],
          linkedProfiles: payload.linkedProfiles || payload.platforms || [],
          jobId,
        };

        if (typeof setCandidates === "function") {
          let outcome = null;
          setCandidates((prev) => {
            const list = Array.isArray(prev) ? prev : [];
            const existing = list.find((c) => sameBoardPerson(c, incoming));
            if (existing) {
              const patch = {
                resumeText:
                  resumeText ||
                  existing.resumeText ||
                  existing.resume_text ||
                  "",
                summary: payload.summary || existing.summary || "",
                headline: payload.headline || existing.headline || "",
                education: education || existing.education || "",
                role: incoming.role || existing.role || "",
                jobTitle: incoming.jobTitle || existing.jobTitle || "",
                email: existing.email || incoming.email || "",
                phone: existing.phone || incoming.phone || "",
                source: incoming.source || existing.source,
                sourcedFrom:
                  incoming.sourcedFrom?.length
                    ? incoming.sourcedFrom
                    : existing.sourcedFrom || [],
                sourcedFromText:
                  incoming.sourcedFromText || existing.sourcedFromText || "",
                platforms: incoming.platforms?.length
                  ? incoming.platforms
                  : existing.platforms || [],
                platformIds: incoming.platformIds?.length
                  ? incoming.platformIds
                  : existing.platformIds || [],
                jobId: existing.jobId || jobId || null,
              };
              outcome = {
                kind: "update",
                summary: `Updated ${existing.name} (no duplicate card)`,
              };
              rememberImportPerson({ ...existing, ...patch });
              return list.map((c) =>
                c.id === existing.id ? { ...c, ...patch } : c,
              );
            }
            if (sessionHasPerson(incoming)) {
              outcome = {
                kind: "skip",
                summary: `Already on Board: ${payload.name} (deduped)`,
              };
              return list;
            }
            // Create inside the updater so the next import in this batch
            // sees this person (avoids React stale-closure duplicates).
            const created = {
              id: `cand_${Date.now().toString(36)}_${Math.random()
                .toString(36)
                .slice(2, 8)}`,
              stage: "new",
              notes: [],
              ...incoming,
            };
            rememberImportPerson(created);
            outcome = {
              kind: "create",
              summary: `Created candidate: ${payload.name}`,
            };
            return [...list, created];
          });
          return {
            ok: true,
            summary:
              outcome?.summary || `Created candidate: ${payload.name}`,
          };
        }

        const existing = (Array.isArray(candidates) ? candidates : []).find(
          (c) => sameBoardPerson(c, incoming),
        );
        if (existing || sessionHasPerson(incoming)) {
          if (existing && typeof updateCandidate === "function") {
            updateCandidate(existing.id, {
              resumeText:
                resumeText || existing.resumeText || existing.resume_text || "",
              summary: payload.summary || existing.summary || "",
              headline: payload.headline || existing.headline || "",
              role: incoming.role || existing.role || "",
              jobTitle: incoming.jobTitle || existing.jobTitle || "",
              source: incoming.source || existing.source,
              sourcedFrom: incoming.sourcedFrom,
              sourcedFromText: incoming.sourcedFromText,
              platforms: incoming.platforms,
              platformIds: incoming.platformIds,
            });
            rememberImportPerson(existing);
            return {
              ok: true,
              summary: `Updated ${existing.name} (no duplicate card)`,
            };
          }
          rememberImportPerson(incoming);
          return {
            ok: true,
            summary: `Already on Board: ${payload.name} (deduped)`,
          };
        }

        addCandidate(incoming);
        rememberImportPerson(incoming);
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
          dedupeBoardCandidates();
          return {
            ok: false,
            reason: `${match.count} cards shared that name — Board was deduped; Check for actions again (or match by email).`,
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
          dedupeBoardCandidates();
          return {
            ok: false,
            reason: `${match.count} cards shared that name — Board was deduped; Check for actions again (or match by email).`,
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
