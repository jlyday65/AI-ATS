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

  function normalizeJobSkills(v) {
    if (Array.isArray(v)) {
      return v
        .map((x) =>
          typeof x === "string"
            ? x
            : x && typeof x === "object"
              ? String(x.name || x.label || x.skill || "")
              : String(x || ""),
        )
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (typeof v === "string" && v.trim()) {
      return v.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    }
    // {} or other junk must never land on a Jobs row (React #31 if rendered)
    return [];
  }

  /** Upsert a Jobs-tab row from Maria / chat JD so Kimberley does not re-enter it. */
  function upsertJobOnBoard(raw = {}) {
    if (typeof setJobs !== "function") return null;
    const title = String(
      raw.title || raw.roleTitle || raw.jobTitle || raw.name || "",
    ).trim();
    if (!title) return null;
    const description = String(
      raw.description ||
        raw.jobDescription ||
        raw.roleDescription ||
        raw.context?.roleDescription ||
        raw.context?.jobDescription ||
        "",
    ).trim();
    const location = String(
      raw.location || raw.context?.location || "",
    ).trim();
    const requiredSkills = normalizeJobSkills(
      raw.requiredSkills ?? raw.context?.requiredSkills,
    );
    const preferredSkills = normalizeJobSkills(
      raw.preferredSkills ?? raw.context?.preferredSkills,
    );
    const now = new Date().toISOString();
    let saved = null;
    setJobs((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const idx = list.findIndex(
        (j) =>
          String(j.title || j.name || "")
            .trim()
            .toLowerCase() === title.toLowerCase(),
      );
      if (idx >= 0) {
        const prevJob = list[idx];
        const thin =
          !prevJob.description ||
          String(prevJob.description).trim().length < 40;
        // Do NOT spread prevJob wholesale — old rows may carry context:{} etc.
        saved = {
          id: prevJob.id,
          title,
          name: title,
          location: location || String(prevJob.location || ""),
          description:
            description || String(prevJob.description || prevJob.jobDescription || ""),
          jobDescription:
            description ||
            String(prevJob.jobDescription || prevJob.description || ""),
          requiredSkills:
            requiredSkills.length > 0
              ? requiredSkills
              : normalizeJobSkills(prevJob.requiredSkills),
          preferredSkills:
            preferredSkills.length > 0
              ? preferredSkills
              : normalizeJobSkills(prevJob.preferredSkills),
          status: String(prevJob.status || "open"),
          source: prevJob.source || raw.source || "gina_chat",
          createdAt: prevJob.createdAt || now,
          updatedAt: now,
          ...(thin && description ? { description, jobDescription: description } : {}),
        };
        const next = list.slice();
        next[idx] = saved;
        return next;
      }
      saved = {
        id: raw.jobId || raw.id || `job_${Date.now().toString(36)}`,
        title,
        name: title,
        location,
        description,
        jobDescription: description,
        requiredSkills,
        preferredSkills,
        status: "open",
        source: raw.source || "gina_chat",
        createdAt: now,
        updatedAt: now,
      };
      return [saved, ...list];
    });
    // Persist for Maria/Michelle without closing over React state (Safari-safe).
    try {
      if (typeof window !== "undefined" && saved) {
        window.__ginaActiveJob = saved;
      }
    } catch {
      /* optional */
    }
    // Do NOT call setSelectedJob/setActiveJob here — Gina's selectedJob state
    // may be id-typed or default to {}, and writing a job object causes React #31.
    return saved;
  }

  function maybeUpsertJobFromPayload(payload = {}) {
    const title = String(
      payload.roleTitle ||
        payload.jobTitle ||
        payload.title ||
        payload.context?.roleTitle ||
        payload.job?.title ||
        "",
    ).trim();
    const description =
      payload.roleDescription ||
      payload.jobDescription ||
      payload.description ||
      payload.context?.roleDescription ||
      payload.context?.jobDescription ||
      payload.job?.description;
    if (!title) return null;
    // Never create a Jobs row for the Candidate File placeholder title.
    if (/^open role$/i.test(title)) return null;
    // Require a real JD (not just a one-line task) before creating Jobs rows.
    if (!description || String(description).trim().length < 40) return null;
    return upsertJobOnBoard({
      ...payload,
      title,
      roleTitle: title,
      description,
      location: payload.location || payload.context?.location,
      requiredSkills: payload.requiredSkills || payload.context?.requiredSkills,
      preferredSkills: payload.preferredSkills || payload.context?.preferredSkills,
      jobId: payload.jobId || payload.context?.jobId,
      source: "kimberley_notify",
    });
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

      // --- Jobs tab: create/update when Kimberley sends a new role + JD ---
      if (
        type === "upsert_job" ||
        type === "create_job" ||
        type === "ensure_job" ||
        type === "import_job"
      ) {
        const job = upsertJobOnBoard({
          ...payload,
          title: payload.title || payload.roleTitle || payload.jobTitle,
          description:
            payload.description ||
            payload.jobDescription ||
            payload.roleDescription,
          location: payload.location,
          requiredSkills: payload.requiredSkills,
          preferredSkills: payload.preferredSkills,
          jobId: payload.jobId || payload.id,
          source: payload.source || "gina_upsert_job",
        });
        if (!job) {
          return {
            ok: false,
            reason:
              "upsert_job needs title/roleTitle and a job description (40+ chars).",
          };
        }
        return {
          ok: true,
          summary: `Jobs tab updated: ${job.title}${job.description ? " (description saved)" : ""}`,
          job,
        };
      }

      // --- Team commands (Kimberley → Gina → Maria/Michelle/Kelley/Ashton) ---
      if (type === "command_agent" || type === "source_candidates_signalhire" || type === "create_candidate_file") {
        // When Kimberley includes a new job + JD for Maria, populate Jobs first.
        const jobUpserted = maybeUpsertJobFromPayload(payload || {});
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
        // Also upsert from server-normalized fields if chat payload was thin.
        // create_candidate_file returns result.file.job + flattened roleTitle/roleDescription.
        const fileJob = data.result?.file?.job || data.result?.job || {};
        const mariaJob =
          data.result?.mariaResult?.job ||
          data.result?.mariaResult?.result?.job ||
          {};
        const fromServer = maybeUpsertJobFromPayload({
          ...(payload || {}),
          roleTitle:
            data.result?.roleTitle ||
            data.result?.title ||
            fileJob.title ||
            data.result?.mariaResult?.roleTitle ||
            mariaJob.title ||
            payload?.roleTitle,
          roleDescription:
            data.result?.roleDescription ||
            data.result?.jobDescription ||
            fileJob.description ||
            data.result?.mariaResult?.roleDescription ||
            payload?.roleDescription ||
            payload?.jobDescription,
          location:
            data.result?.location ||
            fileJob.location ||
            mariaJob.location ||
            payload?.location,
          job: fileJob.title ? fileJob : undefined,
        });
        const jobNote = jobUpserted || fromServer;

        // Maria shortlist often lands in Kimberley Notes first; push queues
        // import_candidate for a *later* Check for actions. Import from the
        // live response in this same click so the Board updates immediately.
        let boardImported = 0;
        const shortlist =
          data.result?.mariaResult?.topCandidates ||
          data.result?.mariaResult?.result?.topCandidates ||
          data.result?.topCandidates ||
          data.result?.result?.topCandidates ||
          [];
        const jobTitleForBoard =
          jobNote?.title ||
          fileJob.title ||
          mariaJob.title ||
          data.result?.roleTitle ||
          payload?.roleTitle ||
          "";
        if (Array.isArray(shortlist) && shortlist.length) {
          for (const c of shortlist.slice(0, 8)) {
            const name = c?.name || c?.fullName;
            if (!name) continue;
            const resumeText =
              c.resumeText ||
              c.resume_text ||
              c.summary ||
              c.headline ||
              "";
            const imported = await applyAgentAction({
              type: "import_candidate",
              id: `maria_inline_${Date.now().toString(36)}`,
              payload: {
                name,
                email: c.email || "",
                phone: c.phone || "",
                jobTitle: jobTitleForBoard || c.jobTitle || c.role || "",
                role: jobTitleForBoard || c.jobTitle || c.role || "",
                headline: c.headline || "",
                resumeText,
                summary: c.summary || "",
                sourcedFrom: c.sourcedFrom || c.platforms || [],
                sourcedFromText:
                  c.sourcedFromText ||
                  (Array.isArray(c.sourcedFrom)
                    ? c.sourcedFrom.join(" · ")
                    : "") ||
                  "SignalHire",
                platforms: c.platforms || c.linkedProfiles || [],
                platformIds: c.platformIds || [],
                source: "SignalHire",
              },
            });
            if (imported?.ok) boardImported += 1;
          }
        }

        // Drain follow-on rows created by this action (same Check click):
        // create_candidate_file → upsert_job + Maria command_agent
        // Maria source → import_candidate
        // Guard against recursive drains exploding the stack.
        let drained = 0;
        let drainedBoard = 0;
        const drainDepth = Number(action?._ginaDrainDepth || 0);
        if (drainDepth < 2) {
          try {
            const pendingRes = await fetch("/ats/pending-actions", {
              credentials: "include",
            });
            const pendingJson = await pendingRes.json().catch(() => ({}));
            const pending = Array.isArray(pendingJson)
              ? pendingJson
              : pendingJson.actions || pendingJson.pending || [];
            const followOns = (Array.isArray(pending) ? pending : [])
              .filter((a) => {
                if (!a || String(a.id) === String(action.id)) return false;
                const t = String(a.type || "");
                if (
                  t === "import_candidate" ||
                  t === "create_candidate" ||
                  t === "upsert_job"
                ) {
                  return true;
                }
                // Only auto-run Maria handoffs queued by Candidate File — not
                // every pending bot command (avoids surprising status runs).
                if (
                  type === "create_candidate_file" &&
                  (t === "command_agent" || t === "source_candidates_signalhire")
                ) {
                  const p = a.payload || {};
                  const agent = String(
                    p.targetAgent || p.agent || "",
                  ).toLowerCase();
                  return agent === "maria" || t === "source_candidates_signalhire";
                }
                return false;
              })
              .slice(0, 12);
            for (const next of followOns) {
              const r = await applyAgentAction({
                ...next,
                _ginaDrainDepth: drainDepth + 1,
              });
              if (r?.ok) {
                drained += 1;
                drainedBoard += Number(r.boardImported || 0);
                try {
                  await fetch(`/ats/actions/${next.id}/complete`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ ok: true, summary: r.summary }),
                  });
                } catch {
                  /* optional — outer Check for actions may mark done */
                }
              }
            }
          } catch {
            /* pending drain is best-effort */
          }
        }

        const totalBoard = boardImported + drainedBoard;
        const boardNote =
          totalBoard > 0
            ? ` · Board: ${totalBoard} candidate(s)`
            : drained > 0 && type === "create_candidate_file"
              ? ` · Follow-on ${drained} action(s) applied`
              : "";
        return {
          ok: true,
          summary:
            (data.summary ||
              (data.reply
                ? `${data.result?.agent || "Team"} replied — see Kimberley's Notes`
                : "Team command executed")) +
            (jobNote ? ` · Jobs: ${jobNote.title}` : "") +
            boardNote,
          kimberleyNoteId: data.kimberleyNoteId || null,
          reply: data.reply || null,
          job: jobNote || null,
          boardImported: totalBoard,
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
