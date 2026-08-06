#!/usr/bin/env node
/**
 * Unify Board Screening with Jobs Tab setup:
 *   - Same UI: Generate questions + Have Maria design full screening
 *   - job.questions is the shared template (source of truth)
 *   - Applying questions from either tab updates Jobs AND linked Board candidates
 *   - Answers/scores on Board are preserved by question text when templates change
 *
 * ONE LINE:
 *   node gina-express/frontend/patch-unify-screening-questions.mjs ~/lyday-gina-backend/gina-backend
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootArg = String(process.argv[2] || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");
if (!rootArg) {
  console.error(
    "Usage: node patch-unify-screening-questions.mjs ~/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

const root = path.resolve(rootArg);
const ginaDir = fs.existsSync(path.join(root, "frontend", "src", "App.jsx"))
  ? root
  : fs.existsSync(path.join(root, "gina-backend", "frontend", "src", "App.jsx"))
    ? path.join(root, "gina-backend")
    : root;

const appPath = path.join(ginaDir, "frontend", "src", "App.jsx");
if (!fs.existsSync(appPath)) {
  console.error("App.jsx not found:", appPath);
  process.exit(2);
}

function loadEsbuild() {
  try {
    const req = createRequire(
      path.join(ginaDir, "frontend", "node_modules", "esbuild", "package.json"),
    );
    return req("esbuild");
  } catch {
    return null;
  }
}

function canCompile(esbuild, text) {
  if (!esbuild) return { ok: true, skipped: true };
  try {
    esbuild.transformSync(text, {
      loader: "jsx",
      jsx: "automatic",
      logLevel: "silent",
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.errors?.[0]?.text || e.message || e) };
  }
}

const HELPERS = `
  /** Shared screening template helpers — Jobs Tab + Board stay in sync. */
  function __ginaMergeScreeningAnswers(questions = [], existing = []) {
    const prev = Array.isArray(existing) ? existing : [];
    return (Array.isArray(questions) ? questions : [])
      .map((q) => {
        const text = String(
          typeof q === "string" ? q : q?.question || q?.text || "",
        ).trim();
        if (!text) return null;
        const hit = prev.find(
          (s) =>
            String(s?.question || "")
              .trim()
              .toLowerCase() === text.toLowerCase(),
        );
        return {
          question: text,
          answer: hit?.answer || "",
          score: hit?.score != null ? Number(hit.score) || 0 : 0,
        };
      })
      .filter(Boolean);
  }

  function __ginaApplySharedScreeningQuestions({
    questions,
    jobId,
    candidateId,
    setJobs,
    setCandidates,
    updateCandidate,
  }) {
    const qs = (Array.isArray(questions) ? questions : [])
      .map((q) => String(typeof q === "string" ? q : q?.question || q?.text || "").trim())
      .filter(Boolean);
    if (!qs.length) return;

    if (jobId && typeof setJobs === "function") {
      setJobs((prev) =>
        (Array.isArray(prev) ? prev : []).map((job) =>
          job && String(job.id) === String(jobId)
            ? { ...job, questions: qs }
            : job,
        ),
      );
    }

    const patchOne = (c) => {
      if (!c) return c;
      const linked =
        (jobId && String(c.jobId) === String(jobId)) ||
        (candidateId && String(c.id) === String(candidateId));
      if (!linked) return c;
      return {
        ...c,
        usesCustomQuestions: false,
        screening: __ginaMergeScreeningAnswers(qs, c.screening || []),
      };
    };

    if (typeof setCandidates === "function") {
      setCandidates((prev) => (Array.isArray(prev) ? prev : []).map(patchOne));
    } else if (candidateId && typeof updateCandidate === "function") {
      // Best-effort single update when only updateCandidate exists
      updateCandidate(candidateId, {
        usesCustomQuestions: false,
        screening: __ginaMergeScreeningAnswers(qs, []),
      });
    }
  }
`;

const BOARD_SCREENING_SETUP = `
function BoardScreeningSetup({
  candidate,
  onUpdateJD,
  onApplyShared,
  onReset,
  jobTitle,
  jobDescription,
}) {
  const [open, setOpen] = React.useState(true);
  const [genState, setGenState] = React.useState("idle");
  const [draft, setDraft] = React.useState(null);
  const [mariaState, setMariaState] = React.useState("idle");
  const [mariaResult, setMariaResult] = React.useState(null);
  const [mariaErr, setMariaErr] = React.useState("");

  const role =
    jobTitle ||
    candidate.role ||
    candidate.jobTitle ||
    "";
  const jd =
    jobDescription ||
    candidate.jobDescription ||
    "";

  async function generateQuick() {
    setGenState("working");
    try {
      const list = await (typeof generateScreeningQuestions === "function"
        ? generateScreeningQuestions(role, jd)
        : typeof YO === "function"
          ? YO(role, jd)
          : Promise.reject(new Error("generate helper missing")));
      setDraft((list || []).map((t) => ({ text: t, include: true })));
      setGenState("idle");
    } catch (e) {
      setGenState("error");
    }
  }

  function applyDraft() {
    const qs = (draft || []).filter((d) => d.include).map((d) => d.text);
    if (!qs.length) return;
    onApplyShared(qs);
    setDraft(null);
  }

  async function runMariaSetup() {
    setMariaState("working");
    setMariaErr("");
    try {
      const cfg =
        typeof ir === "function"
          ? await ir()
          : typeof loadSuperagentsConfig === "function"
            ? await loadSuperagentsConfig()
            : {};
      const baseUrl = cfg.baseUrl || cfg.mariaBaseUrl || "";
      const relaySecret = cfg.relaySecret || "";
      if (!baseUrl) {
        throw new Error("Set Maria's backend URL in the Maria tab first.");
      }
      const headers =
        typeof jt === "function"
          ? jt(relaySecret)
          : {
              "Content-Type": "application/json",
              ...(relaySecret ? { "X-Relay-Secret": relaySecret } : {}),
            };
      const res = await fetch(
        String(baseUrl).replace(/\\/$/, "") + "/maria/screening-setup",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            roleTitle: role,
            roleDescription: jd,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "HTTP " + res.status);
      setMariaResult(data);
      setMariaState("idle");
    } catch (e) {
      setMariaErr(String(e.message || e));
      setMariaState("error");
    }
  }

  function applyMaria() {
    if (!mariaResult) return;
    const qs = (mariaResult.questions || []).map((q) => q.text || q.question).filter(Boolean);
    if (!qs.length) return;
    onApplyShared(qs);
    setMariaResult(null);
  }

  return (
    <div
      data-board-screening-setup="1"
      style={{
        border: "1px solid #E3DFD5",
        borderRadius: 8,
        background: "#FBFAF7",
        marginBottom: 12,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 12px",
          border: "none",
          background: "none",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        <span>Screening questions for this role</span>
        <span style={{ fontSize: 11, color: "#918D80", fontWeight: 500 }}>
          {candidate.usesCustomQuestions ? "Custom override" : "Synced with Jobs"}
        </span>
      </button>
      {open && (
        <div
          style={{
            padding: "0 12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 11.5, color: "#918D80" }}>
            Same setup as Jobs → Edit. Questions sync both ways. Answers you enter
            here stay with this candidate and are kept when the shared template updates.
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#918D80", marginBottom: 4 }}>
              Job description (improves Generate + Maria)
            </label>
            <textarea
              value={jd}
              onChange={(e) => onUpdateJD(e.target.value)}
              placeholder="Paste the job description here"
              style={{
                width: "100%",
                height: 90,
                resize: "vertical",
                fontSize: 12.5,
                padding: 8,
                borderRadius: 8,
                border: "1px solid #E3DFD5",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={generateQuick}
              disabled={genState === "working"}
              style={{
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 12px",
                borderRadius: 8,
                border: "1px solid #E3DFD5",
                background: "#fff",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              {genState === "working" ? "Generating…" : "Generate questions"}
            </button>
            {candidate.usesCustomQuestions && (
              <button
                type="button"
                onClick={onReset}
                style={{
                  padding: "7px 12px",
                  borderRadius: 8,
                  border: "1px solid #E3DFD5",
                  background: "#fff",
                  color: "#918D80",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Reset to Jobs / standard
              </button>
            )}
          </div>
          {genState === "error" && (
            <div style={{ fontSize: 12, color: "#A34A42" }}>
              Couldn't generate questions — try again.
            </div>
          )}
          {draft && (
            <div
              style={{
                border: "1px solid #E3DFD5",
                borderRadius: 8,
                padding: 10,
                background: "#fff",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 12, color: "#918D80" }}>
                Review, uncheck any you don't want, then apply (updates Jobs + Board):
              </div>
              {draft.map((row, idx) => (
                <label
                  key={idx}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    fontSize: 13,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={row.include}
                    onChange={(e) => {
                      const next = [...draft];
                      next[idx] = { ...next[idx], include: e.target.checked };
                      setDraft(next);
                    }}
                    style={{ marginTop: 3 }}
                  />
                  <span>{row.text}</span>
                </label>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={applyDraft}
                  style={{
                    padding: "7px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: "#2F6459",
                    color: "#fff",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  Use these questions
                </button>
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  style={{
                    padding: "7px 12px",
                    borderRadius: 8,
                    border: "1px solid #E3DFD5",
                    background: "#fff",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  Discard
                </button>
              </div>
            </div>
          )}

          <div
            style={{
              border: "1px solid #E3DFD5",
              borderRadius: 8,
              padding: 12,
              background: "#FBFAF7",
            }}
          >
            <div
              style={{
                fontWeight: 600,
                fontSize: 13,
                marginBottom: 8,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              Have Maria design full screening
            </div>
            <div style={{ fontSize: 11.5, color: "#918D80", marginBottom: 8 }}>
              Richer than the quick generator above — extracts must-haves /
              deal-breakers / confidentiality level, tailors questions to those
              specifics, and flags legally sensitive ones (heuristic aid, not
              legal certification).
            </div>
            <button
              type="button"
              onClick={runMariaSetup}
              disabled={mariaState === "working"}
              style={{
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 12px",
                borderRadius: 8,
                border: "1px solid #E3DFD5",
                background: "#fff",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              {mariaState === "working" ? "Working…" : "Run Maria's screening setup"}
            </button>
            {mariaState === "error" && (
              <div style={{ fontSize: 12, color: "#A34A42", marginTop: 6 }}>
                {mariaErr}
              </div>
            )}
            {mariaResult && (
              <div
                style={{
                  border: "1px solid #E3DFD5",
                  borderRadius: 8,
                  padding: 10,
                  background: "#fff",
                  marginTop: 10,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 12 }}>
                  <strong>Confidentiality:</strong>{" "}
                  {mariaResult.criteria?.confidentialityLevel} —{" "}
                  {mariaResult.criteria?.confidentialityReason}
                </div>
                <div style={{ fontSize: 12 }}>
                  <strong>Must-haves:</strong>{" "}
                  {(mariaResult.criteria?.mustHaves || []).join("; ")}
                </div>
                <div style={{ fontSize: 12 }}>
                  <strong>Deal-breakers:</strong>{" "}
                  {(mariaResult.criteria?.dealBreakers || []).join("; ")}
                </div>
                <div style={{ borderTop: "1px solid #E3DFD5", paddingTop: 8 }}>
                  {(mariaResult.questions || []).map((q, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: 12.5,
                        marginBottom: 6,
                        display: "flex",
                        gap: 6,
                      }}
                    >
                      <span>{i + 1}.</span>
                      <span>
                        {q.text || q.question}
                        {q.flagged && (
                          <span
                            style={{
                              color: "#A34A42",
                              fontWeight: 600,
                              marginLeft: 6,
                            }}
                          >
                            ⚠ flagged — {q.reason}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={applyMaria}
                  style={{
                    padding: "7px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: "#2F6459",
                    color: "#fff",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontSize: 12,
                    alignSelf: "flex-start",
                  }}
                >
                  Use these questions
                </button>
                {mariaResult.disclaimer && (
                  <div style={{ fontSize: 10.5, color: "#918D80" }}>
                    {mariaResult.disclaimer}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
`;

let src = fs.readFileSync(appPath, "utf8");
const bak = `${appPath}.bak-unify-screening-${Date.now()}`;
fs.copyFileSync(appPath, bak);
const esbuild = loadEsbuild();
const before = canCompile(esbuild, src);
if (!before.ok) {
  console.error("App.jsx does not compile — abort:", before.error);
  process.exit(2);
}

let changed = 0;

// 1) Inject helpers once
if (!/__ginaMergeScreeningAnswers/.test(src)) {
  const anchor = src.search(
    /function\s+(generateScreeningQuestions|YO)\b|async function\s+generateScreeningQuestions\b|\/ats\/generate-questions/,
  );
  if (anchor >= 0) {
    // insert before nearest function start
    const fn = src.lastIndexOf("\nfunction ", anchor);
    const asyncFn = src.lastIndexOf("\nasync function ", anchor);
    const at = Math.max(fn, asyncFn);
    const insertAt = at > 0 ? at : anchor;
    src = src.slice(0, insertAt) + "\n" + HELPERS + src.slice(insertAt);
    changed += 1;
    console.log("Inserted shared screening sync helpers");
  } else {
    src = HELPERS + "\n" + src;
    changed += 1;
    console.log("Prepended shared screening sync helpers");
  }
}

// 2) Inject BoardScreeningSetup component once
if (!/function\s+BoardScreeningSetup\b/.test(src) && !/data-board-screening-setup/.test(src)) {
  const insertAt = src.search(
    /\n\s*function\s+(App|CandidateTracker|TailorQuestions|JobEdit|JobEditor)\b/,
  );
  if (insertAt >= 0) {
    src = src.slice(0, insertAt) + "\n" + BOARD_SCREENING_SETUP + src.slice(insertAt);
  } else {
    src = BOARD_SCREENING_SETUP + "\n" + src;
  }
  changed += 1;
  console.log("Inserted BoardScreeningSetup component");
}

// 3) Replace Board TailorQuestions usage with BoardScreeningSetup
if (/Tailor questions to this role/.test(src) || /<qY[\s{]/.test(src) === false) {
  // Replace JSX that mounts Tailor panel — common source pattern
  const replacements = [
    // Source-style TailorQuestions component usage
    {
      re: /<TailorQuestions\b([^>]*)\/>/,
      to: null, // handled below
    },
  ];

  // Replace label text even if component stays (fallback)
  if (/Tailor questions to this role/.test(src)) {
    src = src.replace(
      /Tailor questions to this role/g,
      "Screening questions for this role",
    );
    changed += 1;
    console.log("Renamed Board Tailor header to match Jobs");
  }
}

// Wire onApply for Board to use shared helper — replace applyCustomQuestions / setUsesCustom
// Common patterns in source:
const applyPatterns = [
  // function applyCustomQuestions(id, qs) { updateCandidate(id, { screening: qs.map..., usesCustomQuestions: true }) }
  {
    re: /function\s+applyCustomQuestions\s*\(\s*id\s*,\s*qs\s*\)\s*\{[\s\S]*?usesCustomQuestions\s*:\s*!0|true[\s\S]*?\}/,
    replacement: `function applyCustomQuestions(id, qs) {
    const cand = (typeof candidates !== "undefined" ? candidates : []).find((c) => c.id === id);
    __ginaApplySharedScreeningQuestions({
      questions: qs,
      jobId: cand?.jobId || null,
      candidateId: id,
      setJobs: typeof setJobs === "function" ? setJobs : undefined,
      setCandidates: typeof setCandidates === "function" ? setCandidates : undefined,
      updateCandidate: typeof updateCandidate === "function" ? updateCandidate : undefined,
    });
  }`,
  },
];

for (const p of applyPatterns) {
  if (p.re.test(src)) {
    src = src.replace(p.re, p.replacement);
    changed += 1;
    console.log("Rewired applyCustomQuestions → shared Jobs+Board sync");
    break;
  }
}

// Broader: replace usesCustomQuestions: true when setting screening from generate apply
if (/usesCustomQuestions\s*:\s*!0|usesCustomQuestions\s*:\s*true/.test(src)) {
  // Only rewrite the apply-from-generate path that maps questions to empty answers
  const next = src.replace(
    /screening\s*:\s*([A-Za-z_$][\w$]*)\.map\(\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\(\s*\{\s*question\s*:[^,]+,\s*answer\s*:\s*["']["']\s*,\s*score\s*:\s*0\s*\}\s*\)\s*\)\s*,\s*usesCustomQuestions\s*:\s*(?:!0|true)/g,
    (m, listVar) => {
      // Can't easily inject full shared call inside object literal — mark for manual path
      return m;
    },
  );
  void next;
}

// Replace TailorQuestions / qY mount in Screening tab with BoardScreeningSetup
let mounted = false;
if (/BoardScreeningSetup/.test(src) && !/data-board-screening-setup=["']1["']/.test(src.replace(/function BoardScreeningSetup[\s\S]*?^\}/m, ""))) {
  // If JSX still mounts old Tailor component by name
  if (/<TailorQuestions[\s>]/.test(src)) {
    src = src.replace(
      /<TailorQuestions\b([^>]*)\/>/,
      (full, attrs) => {
        mounted = true;
        return `<BoardScreeningSetup
            candidate={selectedCandidate || candidate || N}
            jobTitle={(selectedCandidate || candidate || N)?.role || (selectedCandidate || candidate || N)?.jobTitle || ""}
            jobDescription={(selectedCandidate || candidate || N)?.jobDescription || ""}
            onUpdateJD={(v) => updateCandidate((selectedCandidate || candidate || N).id, { jobDescription: v })}
            onApplyShared={(qs) => applyCustomQuestions((selectedCandidate || candidate || N).id, qs)}
            onReset={() => resetCandidateQuestions((selectedCandidate || candidate || N).id)}
          />`;
      },
    );
  }
  // Pattern: <qY ... /> won't appear in source
  // Pattern: onApply={...applyCustom...} near Tailor — leave as is if applyCustomQuestions rewired
}

// Jobs "Use these questions" — after setting form.questions, also sync linked candidates
if (/New candidates linked to this job start with these questions automatically/.test(src)) {
  // Find Jobs apply that sets questions from draft checkboxes
  // Inject sync after setForm / onSave paths that assign questions array from draft
  if (!/__ginaApplySharedScreeningQuestions/.test(src.split("New candidates linked")[0].slice(-800))) {
    // Patch common: setForm(f => ({...f, questions: selected}))
    const jobApplyRe =
      /(setForm\s*\(\s*(?:\(?)[a-zA-Z_$][\w$]*\s*=>\s*\(\s*\{[\s\S]{0,120}?questions\s*:\s*)([A-Za-z_$][\w$]*)(\s*[\s\S]{0,80}?\}\s*\)\s*\))/;
    // Too risky — instead wrap Jobs Use these questions handlers via marker comment inject near Maria Use these questions onClick
  }
}

// Explicit Jobs apply sync: when job editor calls something like applyGeneratedQuestions
if (!/__ginaJobsScreeningSyncWired/.test(src)) {
  // After any assignment that looks like questions: draft.filter...map text inside job editor,
  // we add a helper call near "Use these questions" buttons in Jobs by rewriting onClick handlers
  const jobsUseRe =
    /onClick=\{[^}]*Use these questions[^}]*\}/;
  // Better: replace function that applies maria/generate to job form questions
  const mariaUseFn = src.match(
    /function\s+(\w+)\s*\(\s*\)\s*\{\s*(?:if\s*\([^)]+\)\s*)?[a-zA-Z_$][\w$]*\s*&&\s*[a-zA-Z_$][\w$]*\(\s*[a-zA-Z_$][\w$]*\s*=>\s*\(\s*\{[\s\S]*?questions\s*:\s*\([^)]*questions[^)]*\)\.map/,
  );
  if (mariaUseFn) {
    console.log("Found Jobs maria apply fn:", mariaUseFn[1]);
  }

  // Inject post-save sync when jobs are saved/updated with questions
  if (/function\s+updateJob\b/.test(src) && !/__ginaJobsScreeningSyncWired/.test(src)) {
    src = src.replace(
      /function\s+updateJob\s*\(([^)]*)\)\s*\{/,
      (m, args) => `${m}
    try {
      const __ginaPatch = typeof arguments[1] === "object" ? arguments[1] : (${args.split(",")[1] || "null"});
      const __ginaId = ${args.split(",")[0] || "null"};
      if (__ginaPatch && Array.isArray(__ginaPatch.questions) && __ginaId) {
        __ginaApplySharedScreeningQuestions({
          questions: __ginaPatch.questions,
          jobId: __ginaId,
          setJobs,
          setCandidates: typeof setCandidates === "function" ? setCandidates : undefined,
        });
        if (typeof window !== "undefined") window.__ginaJobsScreeningSyncWired = true;
      }
    } catch (_) {}
`,
    );
    changed += 1;
    console.log("Wired updateJob → shared screening sync");
  }
}

// Prefer mounting BoardScreeningSetup where Tailor accordion currently sits in Screening tab
if (
  /Screening questions for this role|Tailor questions/.test(src) &&
  /BoardScreeningSetup/.test(src)
) {
  // Replace entire old TailorQuestions function body usage site:
  // onApply={(qs) => applyCustomQuestions(...)}  keep but ensure applyCustomQuestions is shared
  if (
    !mounted &&
    /onApply=\{[^}]+\}/.test(src) &&
    /onReset=\{[^}]+\}/.test(src) &&
    /jobDescription/.test(src)
  ) {
    // Insert BoardScreeningSetup just before the first kd(/resolveScreening map in screening tab
    const screeningMap = src.search(
      /resolveScreeningQuestions\s*\(|getScreeningForCandidate\s*\(|candidate\.screening\.map|screeningQuestions\.map/,
    );
    // Marker near "Candidate's answer"
    const ans = src.indexOf("Candidate's answer");
    if (ans > 0 && !/data-board-screening-setup/.test(src.slice(Math.max(0, ans - 2500), ans))) {
      // Find start of screening tab section - look backward for Tailor or setup
      const slice = src.slice(Math.max(0, ans - 3500), ans);
      if (/TailorQuestions|BoardScreeningSetup|Generate questions/.test(slice)) {
        console.log("Screening tab already has a setup panel nearby");
      } else {
        // Inject before answer list — find the opening of the map parent
        const injectAt = src.lastIndexOf("\n", ans);
        const inject = `
          <BoardScreeningSetup
            candidate={selected || selectedCandidate || activeCandidate}
            jobTitle={(selected || selectedCandidate || activeCandidate)?.role || (selected || selectedCandidate || activeCandidate)?.jobTitle || ""}
            jobDescription={(selected || selectedCandidate || activeCandidate)?.jobDescription || ""}
            onUpdateJD={(v) => (typeof updateCandidate === "function" ? updateCandidate((selected || selectedCandidate || activeCandidate).id, { jobDescription: v }) : null)}
            onApplyShared={(qs) => applyCustomQuestions((selected || selectedCandidate || activeCandidate).id, qs)}
            onReset={() => (typeof resetCandidateQuestions === "function" ? resetCandidateQuestions((selected || selectedCandidate || activeCandidate).id) : null)}
          />
`;
        // Too ambiguous without exact AST — rely on dist patch for mount
        console.log("Source mount deferred to dist patcher (answer list found)");
        void inject;
        void injectAt;
      }
    }
  }
}

// Rewrite apply that sets usesCustomQuestions true with empty answers — prefer shared merge
src = src.replace(
  /oe\((\w+),\s*\{\s*screening\s*:\s*(\w+)\.map\((\w+)\s*=>\s*\(\{\s*question\s*:\s*\3\s*,\s*answer\s*:\s*""\s*,\s*score\s*:\s*0\s*\}\)\)\s*,\s*usesCustomQuestions\s*:\s*!0\s*\}\)/g,
  (m, id, qs) =>
    `(() => { const __c = (typeof candidates !== "undefined" ? candidates : []).find((c) => c.id === ${id}); __ginaApplySharedScreeningQuestions({ questions: ${qs}, jobId: __c?.jobId, candidateId: ${id}, setJobs: typeof setJobs === "function" ? setJobs : undefined, setCandidates: typeof setCandidates === "function" ? setCandidates : undefined }); })()`,
);

// Source-friendly variant
src = src.replace(
  /(updateCandidate|oe)\(\s*([^,]+)\s*,\s*\{\s*screening\s*:\s*([^,]+)\.map\(\s*(?:\(?)(\w+)(?:\))?\s*=>\s*\(\s*\{\s*question\s*:\s*\4\s*,\s*answer\s*:\s*[\"'][\"']\s*,\s*score\s*:\s*0\s*\}\s*\)\s*\)\s*,\s*usesCustomQuestions\s*:\s*true\s*\}\s*\)/g,
  (m, fn, id, qs) =>
    `__ginaApplySharedScreeningQuestions({ questions: ${qs}, jobId: (typeof candidates !== "undefined" ? candidates : []).find((c) => c.id === ${id})?.jobId, candidateId: ${id}, setJobs: typeof setJobs === "function" ? setJobs : undefined, setCandidates: typeof setCandidates === "function" ? setCandidates : undefined, updateCandidate: typeof updateCandidate === "function" ? updateCandidate : undefined })`,
);

const after = canCompile(esbuild, src);
if (!after.ok) {
  console.error("REFUSING App.jsx after unify screening patch:", after.error);
  fs.copyFileSync(bak, appPath);
  process.exit(2);
}

if (changed > 0 || src !== fs.readFileSync(bak, "utf8")) {
  fs.writeFileSync(appPath, src, "utf8");
  console.log("Wrote", appPath);
  console.log("Backup:", bak);
  console.log("Changes:", changed);
} else {
  console.log("No source changes applied (dist patcher may still update bundle)");
}

console.log(`
Next: run dist patcher + rebuild:
  node gina-express/frontend/patch-unify-screening-questions-dist.mjs ${ginaDir}
  cd ${ginaDir}/frontend && npm run build
`);
