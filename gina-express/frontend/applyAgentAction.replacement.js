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

  /** Map "Rejected" / "Phone Screen" / "interviewing" → Board STAGES.key */
  function normalizeBoardStageKey(raw) {
    let s = String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/[→➞]/g, " ")
      .replace(/[\s-]+/g, "_")
      .replace(/_+/g, "_");
    if (!s) return null;
    if (
      s === "phone_screen" ||
      s === "phonescreen" ||
      s === "pre_screen" ||
      s === "prescreen" ||
      s === "screen" ||
      s === "phone"
    ) {
      return "screening";
    }
    if (
      s === "interviewing" ||
      s === "interviews" ||
      s === "on_site" ||
      s === "onsite" ||
      s === "final"
    ) {
      return "interview";
    }
    if (s === "reject" || s === "rejection" || s === "declined" || s === "pass") {
      return "rejected";
    }
    if (s === "hire") return "hired";
    if (s === "offered") return "offer";
    const allowed = ["new", "screening", "interview", "offer", "hired", "rejected"];
    return allowed.includes(s) ? s : null;
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

  /** Keep live Candidate File in sync with Board / bot actions (non-blocking). */
  async function syncLiveCandidateFile(event = {}) {
    try {
      await fetch("/ats/candidate-files/sync", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
    } catch (_) {
      /* Candidate File may not be mounted yet — Board still updates */
    }
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

  /** Jobs Edit UI requires job.questions to be an array (crashes on .length otherwise). */
  function normalizeJobQuestions(raw) {
    if (Array.isArray(raw)) {
      return raw
        .map((q) =>
          typeof q === "string"
            ? q
            : q && typeof q === "object"
              ? String(q.text || q.question || q.label || "")
              : String(q || ""),
        )
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (typeof raw === "string" && raw.trim()) {
      return raw
        .split(/\n+/)
        .map((s) => s.replace(/^\s*\d+[\.)]\s*/, "").trim())
        .filter(Boolean);
    }
    return [];
  }

  /** Positive integer headcount / sourced count from any common job field. */
  function normalizeHeadcount(raw) {
    if (raw == null || raw === "") return null;
    if (typeof raw === "object") {
      return normalizeHeadcount(
        raw.headcount ??
          raw.Headcount ??
          raw.sourcedCount ??
          raw.candidateCount ??
          raw.pipelineCount ??
          raw.positions ??
          raw.openings ??
          raw.hc,
      );
    }
    const n = Number(String(raw).replace(/[^\d.]/g, ""));
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.min(9999, Math.floor(n));
  }

  /** Count Board cards tied to a job title (or jobId). */
  function countBoardCandidatesForJob(title = "", jobId = "") {
    const list =
      typeof candidates !== "undefined" && Array.isArray(candidates)
        ? candidates
        : typeof window !== "undefined" && Array.isArray(window.__ginaCandidates)
          ? window.__ginaCandidates
          : [];
    const t = String(title || "").trim().toLowerCase();
    const id = String(jobId || "").trim();
    if (!t && !id) return 0;
    return list.filter((c) => {
      if (!c) return false;
      if (id && String(c.jobId || "") === id) return true;
      if (!t) return false;
      const role = String(c.jobTitle || c.role || c.title || "")
        .trim()
        .toLowerCase();
      return role === t;
    }).length;
  }

  /**
   * Resolve the Gina Jobs-tab id for a role title.
   * View Candidates filters Board with candidate.jobId === job.id — title alone is not enough.
   */
  function resolveGinaJobIdForTitle(title = "", preferredId = "") {
    if (preferredId) return String(preferredId);
    const t = String(title || "").trim().toLowerCase();
    if (!t) return null;
    try {
      if (typeof window !== "undefined") {
        for (const key of ["__ginaLastJobUpsert", "__ginaActiveJob"]) {
          const job = window[key];
          if (
            job &&
            String(job.title || job.name || "")
              .trim()
              .toLowerCase() === t &&
            job.id
          ) {
            return String(job.id);
          }
        }
      }
    } catch {
      /* optional */
    }
    const list = Array.isArray(jobs) ? jobs : [];
    const hit = list.find(
      (j) =>
        String(j?.title || j?.name || "")
          .trim()
          .toLowerCase() === t,
    );
    return hit?.id ? String(hit.id) : null;
  }

  /**
   * Link Board cards to a Jobs-tab row so "View candidates" finds them.
   * Matches by jobTitle/role when jobId is missing or points at a foreign id.
   */
  function linkBoardCandidatesToJob(title = "", jobId = "", jobDescription = "") {
    const t = String(title || "").trim().toLowerCase();
    const id = String(jobId || "").trim();
    const jd = String(jobDescription || "").trim();
    if (!t || !id || typeof setCandidates !== "function") return 0;
    let linked = 0;
    setCandidates((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      let changed = false;
      const next = list.map((c) => {
        if (!c) return c;
        const role = String(c.jobTitle || c.role || c.title || "")
          .trim()
          .toLowerCase();
        const sameJob =
          role === t || (id && String(c.jobId || "") === id);
        if (!sameJob) return c;
        const needsId = String(c.jobId || "") !== id;
        const prevJd = String(c.jobDescription || "").trim();
        const needsJd =
          jd &&
          (isThinJobDescription(prevJd) ||
            (!prevJd && !isThinJobDescription(jd)) ||
            (jd.length > prevJd.length && !isThinJobDescription(jd)));
        if (!needsId && !needsJd) return c;
        linked += 1;
        changed = true;
        return {
          ...c,
          jobId: id,
          jobTitle: c.jobTitle || title,
          role: c.role || title,
          ...(needsJd ? { jobDescription: jd } : {}),
        };
      });
      return changed ? next : list;
    });
    return linked;
  }

  /**
   * Candidate File / Maria JD → Jobs Edit (description) + Board Screening
   * (candidate.jobDescription). Kimberley should not re-paste the JD.
   */
  function syncJobDescriptionEverywhere({
    title = "",
    jobId = "",
    description = "",
    location = "",
    source = "candidate_file_jd",
    task = "",
  } = {}) {
    const role = String(title || "").trim();
    const jd = String(description || "").trim();
    if (!role || isThinJobDescription(jd)) return null;
    const job = upsertJobOnBoard({
      title: role,
      roleTitle: role,
      location,
      description: jd,
      roleDescription: jd,
      jobDescription: jd,
      jobId: jobId || undefined,
      source,
      task,
    });
    const id = job?.id || jobId || resolveGinaJobIdForTitle(role, "");
    if (id) {
      linkBoardCandidatesToJob(role, id, jd);
    }
    // Also stamp JD onto any Board cards for this role that still lack it
    // (even when jobId link is pending).
    if (typeof setCandidates === "function") {
      setCandidates((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        let changed = false;
        const next = list.map((c) => {
          if (!c) return c;
          const roleKey = String(c.jobTitle || c.role || c.title || "")
            .trim()
            .toLowerCase();
          const match =
            roleKey === role.toLowerCase() ||
            (id && String(c.jobId || "") === String(id));
          if (!match) return c;
          const prevJd = String(c.jobDescription || "").trim();
          if (!isThinJobDescription(prevJd) && prevJd.length >= jd.length) {
            return c;
          }
          changed = true;
          return {
            ...c,
            jobId: c.jobId || id || null,
            jobTitle: c.jobTitle || role,
            role: c.role || role,
            jobDescription: jd,
          };
        });
        return changed ? next : list;
      });
    }
    return job;
  }

  /** True when description is our thin Gina stub, not Kimberley's real JD. */
  function isThinJobDescription(text = "") {
    const s = String(text || "").trim();
    if (s.length < 40) return true;
    if (/Full-time role managed in Gina Jobs/i.test(s)) return true;
    if (/^Ask:\s*Source candidates for\b/i.test(s)) return true;
    if (/^Role sourced by Maria for\b/i.test(s)) return true;
    return false;
  }

  /** Prefer the richest real JD among candidates (never keep a stub over a full JD). */
  function pickBestJobDescription(...parts) {
    let best = "";
    for (const part of parts) {
      const s = String(part || "").trim();
      if (!s) continue;
      if (isThinJobDescription(s) && !isThinJobDescription(best) && best) continue;
      if (!best || s.length > best.length || (isThinJobDescription(best) && !isThinJobDescription(s))) {
        best = s;
      }
    }
    return best;
  }

  /**
   * Write Maria's sourced headcount (+ full JD) onto the Jobs row.
   * Gina Jobs UI may read headcount / sourcedCount / candidateCount / openings.
   */
  function syncJobSourcedHeadcount(title, count, extra = {}) {
    const hc = normalizeHeadcount(count);
    const role = String(title || "").trim();
    if (!role) return null;
    const description = pickBestJobDescription(
      extra.description,
      extra.roleDescription,
      extra.jobDescription,
      extractJobDescriptionFromText(extra.task || "", role),
    );
    // Allow JD-only refresh when headcount is not ready yet.
    if (!hc && isThinJobDescription(description)) return null;
    return upsertJobOnBoard({
      title: role,
      roleTitle: role,
      location: extra.location || "",
      description,
      roleDescription: description,
      jobDescription: description,
      jobId: extra.jobId,
      ...(hc
        ? {
            headcount: hc,
            sourcedCount: hc,
            candidateCount: hc,
            pipelineCount: hc,
          }
        : {}),
      // Only set openings when the row has none yet (openings ≠ sourced).
      openings: extra.openings,
      positions: extra.positions,
      source: extra.source || "maria_sourced_headcount",
      task: extra.task || "",
    });
  }

  /** Resolve Jobs setter — App usually has setJobs; keep window fallback. */
  function resolveSetJobsFn() {
    try {
      if (typeof setJobs === "function") return setJobs;
    } catch {
      /* TDZ */
    }
    try {
      if (typeof setJobList === "function") return setJobList;
    } catch {
      /* optional */
    }
    try {
      if (
        typeof window !== "undefined" &&
        typeof window.__ginaSetJobs === "function"
      ) {
        return window.__ginaSetJobs;
      }
    } catch {
      /* optional */
    }
    return null;
  }

  try {
    if (typeof setJobs === "function" && typeof window !== "undefined") {
      window.__ginaSetJobs = setJobs;
    }
  } catch {
    /* optional */
  }

  /** Pull the longest usable JD from Kimberley / Gina / Maria text blobs. */
  function extractJobDescriptionFromText(text = "", title = "") {
    const raw = String(text || "").trim();
    if (!raw) return "";
    const labeled = raw.match(
      /\bjob description\s*[:\-]\s*([\s\S]{40,}?)(?:\n\s*\n|send to maria|handoff:|$)/i,
    )?.[1];
    if (labeled && labeled.trim().length >= 40) return labeled.trim();

    const colon = raw.match(
      /\bcandidate\s+file(?:\s+to\s+\w+)?\s*:\s*(?:an?\s+|the\s+)?[A-Z][^\n]{2,80}?\s+in\s+[A-Za-z .]+(?:,\s*[A-Z]{2})?\s+([\s\S]{40,})/i,
    )?.[1];
    if (colon && colon.trim().length >= 40) return colon.trim();

    if (title) {
      const afterTitle = raw.match(
        new RegExp(
          `${String(title).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+in\\s+[A-Za-z .]+(?:,\\s*[A-Z]{2})?\\s+([\\s\\S]{40,})`,
          "i",
        ),
      )?.[1];
      if (afterTitle && afterTitle.trim().length >= 40) return afterTitle.trim();
    }

    // Prefer chunks that look like JDs (duties / requirements), not short source tasks.
    const chunks = raw
      .split(/\n{2,}/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 40)
      .filter(
        (s) =>
          !/^source candidates for\b/i.test(s) &&
          !/^provide a status update\b/i.test(s),
      );
    chunks.sort((a, b) => b.length - a.length);
    if (chunks[0]) return chunks[0];
    return raw.length >= 40 ? raw : "";
  }

  /** Upsert a Jobs-tab row from Maria / chat JD so Kimberley does not re-enter it. */
  function upsertJobOnBoard(raw = {}) {
    const setJobsFn = resolveSetJobsFn();
    if (typeof setJobsFn !== "function") {
      try {
        if (typeof window !== "undefined") {
          window.__ginaLastJobUpsertError = "setJobs is not a function in scope";
        }
      } catch {
        /* optional */
      }
      return null;
    }
    const title = String(
      raw.title || raw.roleTitle || raw.jobTitle || raw.name || "",
    ).trim();
    if (!title) return null;
    if (/^open role$/i.test(title)) return null;
    let description = pickBestJobDescription(
      raw.description,
      raw.jobDescription,
      raw.roleDescription,
      raw.context?.roleDescription,
      raw.context?.jobDescription,
      extractJobDescriptionFromText(raw.task || "", title),
    );
    // Always land a Jobs row when Maria/CF sourced a real title — synthesize if thin.
    if (isThinJobDescription(description)) {
      const loc = String(raw.location || raw.context?.location || "").trim();
      const fromTask = extractJobDescriptionFromText(raw.task || "", title);
      description = pickBestJobDescription(
        fromTask,
        [
          `${title}${loc ? ` — ${loc}` : ""}.`,
          "",
          "Full-time role managed in Gina Jobs (from Kimberley Candidate File / Maria sourcing).",
          raw.task ? `Ask: ${String(raw.task).slice(0, 1200)}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }
    const location = String(
      raw.location || raw.context?.location || "",
    ).trim();
    const requiredSkills = normalizeJobSkills(
      raw.requiredSkills ?? raw.context?.requiredSkills,
    );
    const preferredSkills = normalizeJobSkills(
      raw.preferredSkills ?? raw.context?.preferredSkills,
    );
    const incomingHc = normalizeHeadcount(raw);
    const now = new Date().toISOString();
    let saved = null;
    setJobsFn((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const idx = list.findIndex(
        (j) =>
          String(j.title || j.name || "")
            .trim()
            .toLowerCase() === title.toLowerCase(),
      );
      if (idx >= 0) {
        const prevJob = list[idx];
        const prevDesc = String(
          prevJob.description || prevJob.jobDescription || "",
        ).trim();
        // Keep the richest JD — never let a headcount-only sync wipe Kimberley's JD.
        const mergedDescription = pickBestJobDescription(description, prevDesc);
        const prevHc = normalizeHeadcount(prevJob);
        const headcount =
          incomingHc != null
            ? Math.max(incomingHc, prevHc || 0)
            : prevHc || undefined;
        const prevOpenings = normalizeHeadcount(
          prevJob.openings ?? prevJob.positions,
        );
        const openings =
          normalizeHeadcount(raw.openings ?? raw.positions) ??
          prevOpenings ??
          undefined;
        const questions = normalizeJobQuestions(
          raw.questions ?? prevJob.questions,
        );
        // Do NOT spread prevJob wholesale — old rows may carry context:{} etc.
        saved = {
          id: prevJob.id,
          title,
          name: title,
          location: location || String(prevJob.location || ""),
          description: mergedDescription,
          jobDescription: mergedDescription,
          requiredSkills:
            requiredSkills.length > 0
              ? requiredSkills
              : normalizeJobSkills(prevJob.requiredSkills),
          preferredSkills:
            preferredSkills.length > 0
              ? preferredSkills
              : normalizeJobSkills(prevJob.preferredSkills),
          // Required by Jobs Edit — `o.questions.length` crashes if missing.
          questions,
          status: String(prevJob.status || "open"),
          source: prevJob.source || raw.source || "gina_chat",
          createdAt: prevJob.createdAt || now,
          updatedAt: now,
          createdDate:
            prevJob.createdDate ||
            String(prevJob.createdAt || now).slice(0, 10),
          ...(headcount != null
            ? {
                headcount,
                Headcount: headcount,
                sourcedCount: headcount,
                candidateCount: headcount,
                pipelineCount: headcount,
              }
            : {
                // Edit form number input expects a value; default 1 if unset.
                headcount: Number(prevJob.headcount) > 0 ? prevJob.headcount : 1,
              }),
          ...(openings != null ? { openings, positions: openings } : {}),
        };
        const next = list.slice();
        next[idx] = saved;
        return next;
      }
      const headcount = incomingHc || 1;
      const openings =
        normalizeHeadcount(raw.openings ?? raw.positions) || undefined;
      const questions = normalizeJobQuestions(raw.questions);
      saved = {
        id: raw.jobId || raw.id || `job_${Date.now().toString(36)}`,
        title,
        name: title,
        location,
        description,
        jobDescription: description,
        requiredSkills,
        preferredSkills,
        questions,
        status: "open",
        source: raw.source || "gina_chat",
        createdAt: now,
        updatedAt: now,
        createdDate: now.slice(0, 10),
        headcount,
        Headcount: headcount,
        sourcedCount: incomingHc || headcount,
        candidateCount: incomingHc || headcount,
        pipelineCount: incomingHc || headcount,
        ...(openings != null ? { openings, positions: openings } : {}),
      };
      return [saved, ...list];
    });
    // Persist for Maria/Michelle without closing over React state (Safari-safe).
    try {
      if (typeof window !== "undefined" && saved) {
        window.__ginaActiveJob = saved;
        window.__ginaLastJobUpsert = saved;
        // Mirror into common localStorage keys Gina builds have used.
        const keys = [
          "gina_jobs",
          "ats_jobs",
          "jobs",
          "lyday_jobs",
          "gina-ats-jobs",
        ];
        for (const key of keys) {
          try {
            const prev = localStorage.getItem(key);
            if (prev == null) continue;
            const parsed = JSON.parse(prev);
            if (!Array.isArray(parsed)) continue;
            const i = parsed.findIndex(
              (j) =>
                String(j?.title || j?.name || "")
                  .trim()
                  .toLowerCase() === title.toLowerCase(),
            );
            if (i >= 0) parsed[i] = { ...parsed[i], ...saved };
            else parsed.unshift(saved);
            localStorage.setItem(key, JSON.stringify(parsed));
          } catch {
            /* skip unknown shapes */
          }
        }
      }
    } catch {
      /* optional */
    }
    // Do NOT call setSelectedJob/setActiveJob here — Gina's selectedJob state
    // may be id-typed or default to {}, and writing a job object causes React #31.
    return saved;
  }

  function maybeUpsertJobFromPayload(payload = {}, extras = {}) {
    const blob = [
      extras.taskHint,
      extras.reply,
      payload.task,
      payload.instruction,
      payload.message,
      payload.roleDescription,
      payload.jobDescription,
      payload.description,
      payload.context?.roleDescription,
      payload.context?.jobDescription,
      payload.job?.description,
      typeof payload === "string" ? payload : "",
    ]
      .filter(Boolean)
      .join("\n");

    let title = String(
      payload.roleTitle ||
        payload.jobTitle ||
        payload.title ||
        payload.context?.roleTitle ||
        payload.job?.title ||
        extras.roleTitle ||
        "",
    ).trim();
    // Recover title from Candidate File / source phrasing when payload is thin.
    if (!title || /^open role$/i.test(title)) {
      const m =
        blob.match(
          /\bcandidate\s+file(?:\s+to\s+\w+)?\s*:\s*(?:an?\s+|the\s+)?([A-Z][A-Za-z0-9 /&-]{2,80}?)\s+in\s+/i,
        ) ||
        blob.match(
          /\b(?:source|find)\s+candidates?\s+for\s+(?:an?\s+|the\s+)?([A-Z][A-Za-z0-9 /&-]{2,80}?)(?:\s+in\s+|\.|$)/i,
        ) ||
        blob.match(
          /\b([A-Z][A-Za-z0-9/&-]+(?:\s+[A-Z][A-Za-z0-9/&-]+){1,6})\s+in\s+[A-Z]/,
        );
      if (m?.[1]) title = m[1].replace(/^(?:an?\s+|the\s+)/i, "").trim();
    }
    if (!title || /^open role$/i.test(title)) return null;

    let description = String(
      payload.roleDescription ||
        payload.jobDescription ||
        payload.description ||
        payload.context?.roleDescription ||
        payload.context?.jobDescription ||
        payload.job?.description ||
        extras.roleDescription ||
        "",
    ).trim();
    if (description.length < 40) {
      description = extractJobDescriptionFromText(blob, title);
    }

    return upsertJobOnBoard({
      ...payload,
      title,
      roleTitle: title,
      description,
      location:
        payload.location ||
        payload.context?.location ||
        payload.job?.location ||
        extras.location ||
        "",
      requiredSkills: payload.requiredSkills || payload.context?.requiredSkills,
      preferredSkills: payload.preferredSkills || payload.context?.preferredSkills,
      jobId: payload.jobId || payload.context?.jobId || extras.jobId,
      task: payload.task || extras.taskHint || "",
      source: payload.source || extras.source || "kimberley_notify",
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
        const taskHint = [
          action.summary,
          action.detail,
          action.notes,
          action.description,
          action.task,
          payload?.task,
          payload?.roleDescription,
          payload?.jobDescription,
          payload?.context?.roleDescription,
          payload?.context?.jobDescription,
          typeof action.payload === "string"
            ? action.payload
            : JSON.stringify(action.payload || {}),
          typeof payload === "string" ? payload : JSON.stringify(payload || {}),
        ]
          .filter(Boolean)
          .join("\n");

        // When Kimberley includes a new job + JD for Maria, populate Jobs first.
        const jobUpserted = maybeUpsertJobFromPayload(payload || {}, {
          taskHint,
          source: type === "create_candidate_file" ? "candidate_file" : "kimberley_notify",
        });
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
            taskHint,
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
          data.result?.job ||
          {};
        const mariaDesc =
          data.result?.mariaResult?.job?.description ||
          data.result?.mariaResult?.result?.job?.description ||
          data.result?.mariaResult?.roleDescription ||
          data.result?.mariaResult?.brief ||
          "";
        const fromServer = maybeUpsertJobFromPayload(
          {
            ...(payload || {}),
            roleTitle:
              data.roleTitle ||
              data.result?.roleTitle ||
              data.result?.title ||
              fileJob.title ||
              data.result?.mariaResult?.roleTitle ||
              mariaJob.title ||
              payload?.roleTitle ||
              payload?.context?.roleTitle,
            roleDescription:
              data.roleDescription ||
              data.result?.roleDescription ||
              data.result?.jobDescription ||
              fileJob.description ||
              mariaDesc ||
              payload?.roleDescription ||
              payload?.jobDescription ||
              payload?.context?.roleDescription ||
              payload?.context?.jobDescription,
            location:
              data.location ||
              data.result?.location ||
              fileJob.location ||
              mariaJob.location ||
              payload?.location ||
              payload?.context?.location,
            job: fileJob.title
              ? fileJob
              : mariaJob.title
                ? {
                    ...mariaJob,
                    description:
                      mariaJob.description ||
                      mariaDesc ||
                      fileJob.description ||
                      "",
                  }
                : undefined,
          },
          {
            taskHint: [taskHint, data.reply, data.summary, data.result?.reply]
              .filter(Boolean)
              .join("\n"),
            reply: data.reply || data.result?.reply || "",
            roleTitle: mariaJob.title || fileJob.title,
            roleDescription: mariaDesc || fileJob.description,
            location: mariaJob.location || fileJob.location,
            // Do not stamp SignalHire's job id onto Gina Jobs rows — View
            // candidates keys off Gina job.id ↔ candidate.jobId.
            jobId: undefined,
            source:
              type === "create_candidate_file"
                ? "candidate_file"
                : "maria_source",
          },
        );
        // Force Jobs row whenever Maria/CF produced a concrete role title.
        const forcedTitle = String(
          fromServer?.title ||
            jobUpserted?.title ||
            data.roleTitle ||
            data.result?.roleTitle ||
            fileJob.title ||
            mariaJob.title ||
            payload?.roleTitle ||
            payload?.context?.roleTitle ||
            "",
        ).trim();
        const jobNote =
          jobUpserted ||
          fromServer ||
          (forcedTitle && !/^open role$/i.test(forcedTitle)
            ? upsertJobOnBoard({
                title: forcedTitle,
                roleTitle: forcedTitle,
                location:
                  data.location ||
                  data.result?.location ||
                  fileJob.location ||
                  mariaJob.location ||
                  payload?.location ||
                  payload?.context?.location ||
                  "",
                description:
                  data.roleDescription ||
                  data.result?.roleDescription ||
                  fileJob.description ||
                  mariaDesc ||
                  payload?.context?.roleDescription ||
                  extractJobDescriptionFromText(
                    [taskHint, data.reply].filter(Boolean).join("\n"),
                    forcedTitle,
                  ),
                source: "maria_force_jobs_tab",
                task: taskHint,
              })
            : null);

        // Immediately push Candidate File JD into Jobs Edit + Board Screening
        // fields (even before Maria shortlist arrives).
        if (jobNote?.title) {
          const earlyJd = pickBestJobDescription(
            fileJob.description,
            data.roleDescription,
            data.result?.roleDescription,
            data.result?.jobDescription,
            payload?.roleDescription,
            payload?.jobDescription,
            payload?.context?.roleDescription,
            payload?.context?.jobDescription,
            jobNote.description,
            jobNote.jobDescription,
            mariaDesc,
          );
          if (!isThinJobDescription(earlyJd)) {
            syncJobDescriptionEverywhere({
              title: jobNote.title,
              jobId: jobNote.id || "",
              description: earlyJd,
              location: jobNote.location || fileJob.location || "",
              source:
                type === "create_candidate_file"
                  ? "candidate_file_jd_early"
                  : "job_jd_early",
              task: taskHint,
            });
          }
        }

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
        // Prefer the Gina Jobs-tab id (not a foreign SignalHire id) so
        // Jobs → View candidates (filters by candidate.jobId === job.id) works.
        const ginaJobIdForBoard = resolveGinaJobIdForTitle(
          jobTitleForBoard,
          jobNote?.id || "",
        );
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
                jobId: ginaJobIdForBoard || undefined,
                jobTitle: jobTitleForBoard || c.jobTitle || c.role || "",
                role: jobTitleForBoard || c.jobTitle || c.role || "",
                headline: c.headline || "",
                resumeText,
                summary: c.summary || "",
                // Board Screening + Jobs Edit — carry Candidate File / Jobs JD
                jobDescription:
                  jobNote?.description ||
                  fileJob.description ||
                  payload?.roleDescription ||
                  payload?.jobDescription ||
                  payload?.context?.roleDescription ||
                  payload?.context?.jobDescription ||
                  "",
                roleDescription:
                  jobNote?.description ||
                  fileJob.description ||
                  payload?.roleDescription ||
                  payload?.jobDescription ||
                  "",
                candidateFileId:
                  payload?.context?.candidateFileId ||
                  data.result?.candidateFileId ||
                  data.result?.mariaResult?.candidateFileId ||
                  undefined,
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
        const mariaSourced = normalizeHeadcount(
          data.headcount ||
            data.candidateCount ||
            data.result?.mariaResult?.candidateCount ||
            data.result?.mariaResult?.result?.candidateCount ||
            data.result?.candidateCount ||
            data.result?.headcount ||
            (Array.isArray(shortlist) && shortlist.length
              ? shortlist.length
              : 0) ||
            totalBoard ||
            0,
        );
        const roleForHc =
          jobNote?.title ||
          jobTitleForBoard ||
          forcedTitle ||
          "";
        const boardCount = roleForHc
          ? countBoardCandidatesForJob(roleForHc, jobNote?.id || mariaJob.id)
          : 0;
        const headcount = Math.max(
          mariaSourced || 0,
          totalBoard || 0,
          boardCount || 0,
        );
        const bestDescription = pickBestJobDescription(
          data.roleDescription,
          data.result?.roleDescription,
          data.result?.jobDescription,
          fileJob.description,
          mariaDesc,
          mariaJob.description,
          payload?.roleDescription,
          payload?.jobDescription,
          payload?.context?.roleDescription,
          payload?.context?.jobDescription,
          jobNote?.description,
          jobNote?.jobDescription,
          extractJobDescriptionFromText(
            [taskHint, data.reply, data.summary, data.result?.reply]
              .filter(Boolean)
              .join("\n"),
            roleForHc,
          ),
        );
        let jobWithHc = jobNote;
        if (roleForHc && (headcount > 0 || !isThinJobDescription(bestDescription))) {
          jobWithHc =
            syncJobSourcedHeadcount(roleForHc, headcount || null, {
              location:
                jobNote?.location ||
                mariaJob.location ||
                fileJob.location ||
                data.location ||
                payload?.location ||
                "",
              description: bestDescription,
              roleDescription: bestDescription,
              jobDescription: bestDescription,
              // Keep Gina job id stable — do not replace with SignalHire job id.
              jobId: jobNote?.id || ginaJobIdForBoard || undefined,
              source: "maria_sourced_headcount",
              task: taskHint,
            }) || jobNote;
        }
        // View Candidates counts/filters by jobId — link Board cards to this Jobs row.
        const linkJobId =
          jobWithHc?.id || ginaJobIdForBoard || resolveGinaJobIdForTitle(roleForHc);
        let linkedToJob = 0;
        if (roleForHc && linkJobId) {
          linkedToJob = linkBoardCandidatesToJob(
            roleForHc,
            linkJobId,
            bestDescription || jobWithHc?.description || "",
          );
        }
        // Candidate File / Maria JD → Jobs Edit + Board Screening jobDescription.
        if (roleForHc && !isThinJobDescription(bestDescription)) {
          jobWithHc =
            syncJobDescriptionEverywhere({
              title: roleForHc,
              jobId: jobWithHc?.id || ginaJobIdForBoard || linkJobId || "",
              description: bestDescription,
              location:
                jobWithHc?.location ||
                jobNote?.location ||
                fileJob.location ||
                mariaJob.location ||
                data.location ||
                payload?.location ||
                "",
              source:
                type === "create_candidate_file"
                  ? "candidate_file_jd"
                  : "maria_jd_sync",
              task: taskHint,
            }) || jobWithHc;
        }

        // Final guarantee: Jobs row always carries the richest JD we have.
        if (
          jobWithHc?.title &&
          !isThinJobDescription(bestDescription) &&
          isThinJobDescription(jobWithHc.description)
        ) {
          jobWithHc =
            upsertJobOnBoard({
              ...jobWithHc,
              title: jobWithHc.title,
              description: bestDescription,
              roleDescription: bestDescription,
              jobDescription: bestDescription,
              headcount: jobWithHc.headcount || headcount || undefined,
              source: "jd_backfill",
              task: taskHint,
            }) || jobWithHc;
        }

        // Kelley / Michelle stage moves — slide cards under the right Board column
        // in this same Check for actions click (not Notes-only).
        let stageMoved = 0;
        const boardActions =
          data.boardActions ||
          data.result?.boardActions ||
          data.result?.result?.boardActions ||
          [];
        if (Array.isArray(boardActions) && boardActions.length) {
          for (const ba of boardActions.slice(0, 12)) {
            const stagePayload = ba?.payload || ba || {};
            const moved = await applyAgentAction({
              type: "update_stage",
              id: `board_move_${Date.now().toString(36)}_${stageMoved}`,
              payload: {
                match: stagePayload.match || { name: stagePayload.name },
                stage: stagePayload.stage,
                email: stagePayload.email,
                phone: stagePayload.phone,
                jobTitle:
                  stagePayload.jobTitle ||
                  stagePayload.role ||
                  roleForHc ||
                  "",
                candidateFileId:
                  stagePayload.candidateFileId ||
                  payload?.context?.candidateFileId ||
                  data.result?.candidateFileId,
              },
            });
            if (moved?.ok) stageMoved += 1;
          }
        }

        const boardNote =
          totalBoard > 0
            ? ` · Board: ${totalBoard} candidate(s)`
            : drained > 0 && type === "create_candidate_file"
              ? ` · Follow-on ${drained} action(s) applied`
              : "";
        const stageNote =
          stageMoved > 0 ? ` · Board stage moves: ${stageMoved}` : "";
        const hcNote =
          jobWithHc && headcount > 0 ? ` · Headcount: ${headcount}` : "";
        const jdNote =
          jobWithHc && !isThinJobDescription(jobWithHc.description || bestDescription)
            ? " · JD saved"
            : "";
        const linkNote =
          linkedToJob > 0 ? ` · Linked ${linkedToJob} to View candidates` : "";
        return {
          ok: true,
          summary:
            (data.summary ||
              (data.reply
                ? `${data.result?.agent || "Team"} replied — see Kimberley's Notes`
                : "Team command executed")) +
            (jobWithHc ? ` · Jobs: ${jobWithHc.title}` : "") +
            hcNote +
            jdNote +
            boardNote +
            stageNote +
            linkNote,
          kimberleyNoteId: data.kimberleyNoteId || null,
          reply: data.reply || null,
          job: jobWithHc || null,
          boardImported: totalBoard,
          stageMoved,
          headcount: headcount || null,
          linkedToJob,
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
        // Board cards often arrive before Jobs — ensure the role exists on Jobs tab.
        // Do NOT use resumeText as the job description.
        const importRoleTitle = payload.jobTitle || payload.role || "";
        const importJd = pickBestJobDescription(
          payload.roleDescription,
          payload.jobDescription,
          payload.context?.roleDescription,
          payload.context?.jobDescription,
          // Prefer existing Jobs-tab JD when import payload is thin
          (() => {
            try {
              const id = resolveGinaJobIdForTitle(importRoleTitle, "");
              const jobsList =
                typeof jobs !== "undefined" && Array.isArray(jobs)
                  ? jobs
                  : typeof window !== "undefined" &&
                      window.__ginaLastJobUpsert &&
                      String(window.__ginaLastJobUpsert.title || "")
                        .toLowerCase() === importRoleTitle.toLowerCase()
                    ? [window.__ginaLastJobUpsert]
                    : [];
              const hit =
                jobsList.find((j) => String(j?.id) === String(id)) ||
                jobsList.find(
                  (j) =>
                    String(j?.title || j?.name || "")
                      .trim()
                      .toLowerCase() === importRoleTitle.toLowerCase(),
                );
              return hit?.description || hit?.jobDescription || "";
            } catch {
              return "";
            }
          })(),
        );
        let ensuredJob = null;
        if (importRoleTitle) {
          ensuredJob = upsertJobOnBoard({
            title: importRoleTitle,
            roleTitle: importRoleTitle,
            location: payload.location || "",
            description: importJd,
            roleDescription: importJd,
            jobDescription: importJd,
            // Only pass jobId when it already belongs to a Gina Jobs row.
            jobId: resolveGinaJobIdForTitle(importRoleTitle, "") || undefined,
            source: "import_candidate",
            task: `Candidates imported for ${importRoleTitle}`,
          });
        }
        let jobId =
          payload.jobId ||
          ensuredJob?.id ||
          resolveGinaJobIdForTitle(importRoleTitle, "") ||
          null;
        // If payload.jobId is a foreign SignalHire id, prefer the Gina Jobs row id.
        if (importRoleTitle) {
          const ginaId = resolveGinaJobIdForTitle(importRoleTitle, ensuredJob?.id || "");
          if (ginaId) jobId = ginaId;
        }
        const boardJd = pickBestJobDescription(
          importJd,
          ensuredJob?.description,
          ensuredJob?.jobDescription,
        );
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
          // Board Screening textarea binds to candidate.jobDescription
          jobDescription: boardJd || "",
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
              const prevJd = String(existing.jobDescription || "").trim();
              const nextJd = pickBestJobDescription(boardJd, prevJd);
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
                jobDescription: nextJd || existing.jobDescription || "",
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
          await syncLiveCandidateFile({
            type: "import_candidate",
            fromAgent: "Maria",
            agentRole: "Sourcer",
            candidateFileId: payload.candidateFileId,
            jobTitle: importRoleTitle || incoming.role,
            jobId,
            candidate: incoming,
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
        await syncLiveCandidateFile({
          type: "import_candidate",
          fromAgent: "Maria",
          agentRole: "Sourcer",
          candidateFileId: payload.candidateFileId,
          jobTitle: importRoleTitle || incoming.role,
          jobId,
          candidate: incoming,
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
          dedupeBoardCandidates();
          return {
            ok: false,
            reason: `${match.count} cards shared that name — Board was deduped; Check for actions again (or match by email).`,
          };
        }
        // Normalize Title Case / aliases ("Rejected", "Phone Screen",
        // "interviewing") to Board STAGES keys so cards slide correctly.
        const stageKey = normalizeBoardStageKey(payload?.stage);
        if (!stageKey || !STAGES.some((s) => s.key === stageKey)) {
          return {
            ok: false,
            reason: `"${payload?.stage}" isn't a valid stage.`,
          };
        }
        setStage(match.id, stageKey);
        await syncLiveCandidateFile({
          type: "update_stage",
          fromAgent: "Kelley",
          agentRole: "Pipeline ops",
          candidateFileId: payload.candidateFileId,
          jobTitle: match.jobTitle || match.role || payload?.jobTitle || "",
          jobId: match.jobId,
          name: match.name,
          stage: stageKey,
          candidate: {
            name: match.name,
            stage: stageKey,
            jobTitle: match.jobTitle || match.role,
          },
        });
        return {
          ok: true,
          summary: `Moved ${match.name} to ${stageMeta(stageKey).label}`,
        };
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
        await syncLiveCandidateFile({
          type: "add_note",
          fromAgent: payload.fromAgent || "Ashton",
          agentRole: payload.agentRole || "Outreach",
          candidateFileId: payload.candidateFileId,
          jobTitle: match.jobTitle || match.role || "",
          jobId: match.jobId,
          name: match.name,
          text: payload.text,
          candidate: { name: match.name, jobTitle: match.jobTitle || match.role },
        });
        return { ok: true, summary: `Added a note to ${match.name}` };
      }

      return { ok: false, reason: `Unknown action type "${type}".` };
    } catch (e) {
      return { ok: false, reason: e.message || String(e) };
    }
  }
