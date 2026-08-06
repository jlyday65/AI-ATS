#!/usr/bin/env node
/**
 * Make the Dashboard tab use the same stage columns as the Board.
 * Candidates slide under New / Screening / Interview / Offer / Hired / Rejected
 * using __ginaBoardColumnKey (same normalizer as Board).
 *
 * Usage:
 *   node gina-express/frontend/patch-dashboard-stage-pipeline.mjs ~/lyday-gina-backend
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = String(process.argv[2] || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");
if (!root) {
  console.error("Usage: node patch-dashboard-stage-pipeline.mjs <gina-root>");
  process.exit(1);
}

const appCandidates = [
  path.join(root, "gina-backend/frontend/src/App.jsx"),
  path.join(root, "frontend/src/App.jsx"),
  path.join(root, "gina-backend/frontend/App.jsx"),
];
const appPath = appCandidates.find((p) => fs.existsSync(p));
if (!appPath) {
  console.error("App.jsx not found under", root);
  process.exit(1);
}

function loadEsbuild() {
  try {
    const req = createRequire(
      path.join(path.dirname(appPath), "../node_modules/esbuild/package.json"),
    );
    return req("esbuild");
  } catch {
    try {
      const req = createRequire(path.join(__dirname, "../../package.json"));
      return req("esbuild");
    } catch {
      return null;
    }
  }
}

function canCompile(esbuild, text) {
  if (!esbuild) return { ok: true };
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

let src = fs.readFileSync(appPath, "utf8");
const bak = `${appPath}.bak-dash-pipeline-${Date.now()}`;
fs.copyFileSync(appPath, bak);
const esbuild = loadEsbuild();
const before = canCompile(esbuild, src);
if (!before.ok) {
  console.error("App.jsx does not compile — abort:", before.error);
  process.exit(2);
}

const HELPER = `
function __ginaBoardColumnKey(raw) {
  let s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[→➞]/g, " ")
    .replace(/[\\s-]+/g, "_")
    .replace(/_+/g, "_");
  if (!s) return "new";
  if (
    s === "phone_screen" ||
    s === "phonescreen" ||
    s === "pre_screen" ||
    s === "prescreen" ||
    s === "screen" ||
    s === "phone"
  )
    return "screening";
  if (
    s === "interviewing" ||
    s === "interviews" ||
    s === "on_site" ||
    s === "onsite" ||
    s === "final"
  )
    return "interview";
  if (s === "reject" || s === "rejection" || s === "declined" || s === "pass")
    return "rejected";
  if (s === "hire") return "hired";
  if (s === "offered") return "offer";
  const allowed = ["new", "screening", "interview", "offer", "hired", "rejected"];
  return allowed.includes(s) ? s : "new";
}
`;

if (!/function\s+__ginaBoardColumnKey\b/.test(src)) {
  const at = src.search(
    /(?:const|let|var)\s+STAGES\s*=|function\s+countLiveStageCounts\b|function\s+applyAgentAction\b|function\s+(?:App|CandidateTracker)\b/,
  );
  if (at >= 0) src = src.slice(0, at) + HELPER + "\n" + src.slice(at);
  else src = HELPER + "\n" + src;
  console.log("Inserted __ginaBoardColumnKey");
}

// Upgrade any thin countLiveStageCounts to use the shared normalizer
if (/function\s+countLiveStageCounts\b/.test(src)) {
  src = src.replace(
    /function\s+countLiveStageCounts\s*\(\s*list\s*=\s*\[\]\s*\)\s*\{[\s\S]*?\n  \}/,
    `function countLiveStageCounts(list = []) {
    const counts = {
      new: 0,
      screening: 0,
      interview: 0,
      offer: 0,
      hired: 0,
      rejected: 0,
    };
    for (const c of Array.isArray(list) ? list : []) {
      const s = __ginaBoardColumnKey(c?.stage ?? c?.status);
      counts[s] = (counts[s] || 0) + 1;
    }
    return counts;
  }`,
  );
  console.log("Upgraded countLiveStageCounts to __ginaBoardColumnKey");
}

const PANEL = `
function DashboardPipelineBoard({
  candidates = [],
  stages = null,
  onSelectCandidate,
}) {
  const cols =
    Array.isArray(stages) && stages.length
      ? stages
      : [
          { key: "new", label: "New" },
          { key: "screening", label: "Screening" },
          { key: "interview", label: "Interview" },
          { key: "offer", label: "Offer" },
          { key: "hired", label: "Hired" },
          { key: "rejected", label: "Rejected" },
        ];
  const list = Array.isArray(candidates) ? candidates : [];
  return (
    <div data-dashboard-pipeline="1" style={{ margin: "12px 0 20px" }}>
      <div
        style={{
          fontWeight: 700,
          fontSize: 15,
          marginBottom: 8,
          color: "#2C2A24",
        }}
      >
        Pipeline — same stages as the Board
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 10,
        }}
      >
        {cols.map((stage) => {
          const people = list.filter(
            (c) => __ginaBoardColumnKey(c?.stage ?? c?.status) === stage.key,
          );
          return (
            <div
              key={stage.key}
              style={{
                background: "#F7F5EF",
                border: "1px solid #E6E2D6",
                borderRadius: 10,
                padding: 10,
                minHeight: 120,
              }}
            >
              <div
                style={{
                  fontWeight: 650,
                  fontSize: 13,
                  marginBottom: 8,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 6,
                }}
              >
                <span>{stage.label || stage.key}</span>
                <span style={{ color: "#918D80" }}>{people.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {people.length === 0 ? (
                  <div style={{ fontSize: 12, color: "#918D80" }}>—</div>
                ) : (
                  people.slice(0, 40).map((c) => (
                    <button
                      key={c.id || c.name}
                      type="button"
                      onClick={() =>
                        typeof onSelectCandidate === "function"
                          ? onSelectCandidate(c)
                          : undefined
                      }
                      style={{
                        textAlign: "left",
                        border: "1px solid #E6E2D6",
                        background: "#fff",
                        borderRadius: 8,
                        padding: "6px 8px",
                        fontSize: 12,
                        cursor: "pointer",
                        color: "#2C2A24",
                      }}
                      title={[c.jobTitle || c.role, c.stage]
                        .filter(Boolean)
                        .join(" · ")}
                    >
                      <div style={{ fontWeight: 600 }}>
                        {c.name || c.fullName || "Candidate"}
                      </div>
                      <div style={{ color: "#918D80", fontSize: 11 }}>
                        {c.jobTitle || c.role || ""}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
`;

if (!/function\s+DashboardPipelineBoard\b/.test(src)) {
  const insertAt = src.search(
    /\n\s*function\s+(App|CandidateTracker|GinaBriefingCard|LiveCandidateFilesPanel|AgentPanel)\b/,
  );
  if (insertAt >= 0) {
    src = src.slice(0, insertAt) + "\n" + PANEL + src.slice(insertAt);
  } else {
    src = PANEL + "\n" + src;
  }
  console.log("Inserted DashboardPipelineBoard");
}

// Mount on dashboard / home views (and next to Live CF panel if present)
let mounted = false;
const mountJsx = `<DashboardPipelineBoard candidates={typeof candidates !== "undefined" ? candidates : []} stages={typeof STAGES !== "undefined" ? STAGES : undefined} />`;

if (
  !/data-dashboard-pipeline=["']1["']/.test(src) ||
  !/<DashboardPipelineBoard\b/.test(src)
) {
  // Prefer mounting inside view === "dashboard" blocks
  const viewMounts = [
    /\{view\s*===\s*["']dashboard["']\s*&&\s*\(/,
    /\{(?:tab|activeView|activeTab)\s*===\s*["']dashboard["']\s*&&\s*\(/,
    /\{view\s*===\s*["']home["']\s*&&\s*\(/,
  ];
  for (const re of viewMounts) {
    if (!re.test(src)) continue;
    const next = src.replace(re, (m) => `${m}\n          ${mountJsx}\n`);
    if (next !== src) {
      src = next;
      mounted = true;
      console.log("Mounted DashboardPipelineBoard in dashboard/home view");
      break;
    }
  }
}

if (!mounted && /<LiveCandidateFilesPanel\b/.test(src)) {
  src = src.replace(
    /<LiveCandidateFilesPanel\b([^>]*)\/>/,
    `<LiveCandidateFilesPanel$1/>\n          ${mountJsx}`,
  );
  if (/<DashboardPipelineBoard\b/.test(src)) {
    mounted = true;
    console.log("Mounted DashboardPipelineBoard next to LiveCandidateFilesPanel");
  }
}

// If dashboard view renders GinaBriefingCard, put pipeline above it
if (!mounted && /GinaBriefingCard/.test(src)) {
  const next = src.replace(
    /(<GinaBriefingCard\b)/,
    `${mountJsx}\n          $1`,
  );
  if (next !== src) {
    src = next;
    mounted = true;
    console.log("Mounted DashboardPipelineBoard before GinaBriefingCard");
  }
}

// Also rewrite any remaining exact stage filters (Board + Dashboard share App.jsx)
src = src.replace(
  /\.filter\(\s*\(?\s*([cCuU])\s*\)?\s*=>\s*\1\.stage\s*===\s*([a-zA-Z_][\w.]*)\.key\s*\)/g,
  ".filter(($1) => __ginaBoardColumnKey($1.stage) === $2.key)",
);
src = src.replace(
  /\.filter\(\s*\(?\s*([cCuU])\s*\)?\s*=>\s*\1\.stage\s*===\s*stage\.key\s*\)/g,
  ".filter(($1) => __ginaBoardColumnKey($1.stage) === stage.key)",
);

const after = canCompile(esbuild, src);
if (!after.ok) {
  console.error("REFUSING App.jsx after dashboard pipeline:", after.error);
  fs.copyFileSync(bak, appPath);
  process.exit(2);
}

fs.writeFileSync(appPath, src, "utf8");
console.log("Patched", appPath);
console.log("Backup:", bak);
console.log(
  mounted
    ? "Dashboard pipeline panel mounted"
    : "Component added — mount manually inside dashboard view if not visible",
);
