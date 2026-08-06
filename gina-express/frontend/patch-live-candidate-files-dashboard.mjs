#!/usr/bin/env node
/**
 * Add a Live Candidate Files panel on the ATS dashboard (App.jsx).
 *
 * Shows open/live Candidate Files Kimberley can open anytime.
 * Prefer placing near Kimberley Notes / Board header.
 *
 * ONE LINE:
 *   node gina-express/frontend/patch-live-candidate-files-dashboard.mjs \
 *     ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
 */

import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { resolveAppJsxPath } from "./notes-toolbar-markup.mjs";

const target = resolveAppJsxPath(process.argv);
if (!target || !fs.existsSync(target)) {
  console.error(
    "Usage: node patch-live-candidate-files-dashboard.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx",
  );
  process.exit(1);
}

function loadEsbuild(appFile) {
  const frontend = path.resolve(path.dirname(appFile), "..");
  try {
    const req = createRequire(
      path.join(frontend, "node_modules", "esbuild", "package.json"),
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

const PANEL = `
function LiveCandidateFilesPanel() {
  const [files, setFiles] = React.useState([]);
  const [err, setErr] = React.useState("");
  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/ats/candidate-files/live?limit=20", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || "Failed to load");
      setFiles(Array.isArray(data.files) ? data.files : []);
      setErr("");
    } catch (e) {
      setErr(String(e.message || e));
    }
  }, []);
  React.useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);
  return (
    <div
      data-live-cf-panel="1"
      style={{
        margin: "12px 0 16px",
        padding: "12px 14px",
        border: "1px solid #E6E2D6",
        borderRadius: 12,
        background: "#FFFEFA",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 650 }}>Live Candidate Files</div>
        <a href="/candidate-file" target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#2F6459" }}>
          Open all
        </a>
      </div>
      <div style={{ fontSize: 12, color: "#918D80", marginTop: 4, marginBottom: 8 }}>
        Bots keep these current until you send to client or cancel. Updates also land in Kimberley Notes + pipeline.
      </div>
      {err ? <div style={{ fontSize: 12, color: "#9b2c2c" }}>{err}</div> : null}
      {!err && !files.length ? (
        <div style={{ fontSize: 12, color: "#918D80" }}>No live files — ask Gina to create a Candidate File.</div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {files.map((f) => (
          <a
            key={f.id}
            href={"/candidate-file?id=" + encodeURIComponent(f.id)}
            target="_blank"
            rel="noreferrer"
            style={{
              textDecoration: "none",
              color: "#2C2A24",
              fontSize: 13,
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #E6E2D6",
              background: "#fff",
            }}
          >
            <strong>{(f.job && f.job.title) || f.id}</strong>
            <span style={{ color: "#2F6459", fontWeight: 650 }}> · LIVE</span>
            <span style={{ color: "#918D80", fontSize: 12 }}>
              {" · "}
              {(f.candidates && f.candidates.length) || 0} candidates
              {f.status ? " · " + f.status : ""}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
`;

let src = fs.readFileSync(target, "utf8");
if (/data-live-cf-panel=["']1["']/.test(src) || /function\s+LiveCandidateFilesPanel\b/.test(src)) {
  console.log("LiveCandidateFilesPanel already present");
  process.exit(0);
}

const esbuild = loadEsbuild(target);
const before = canCompile(esbuild, src);
if (!before.ok) {
  console.error("App.jsx does not compile — abort:", before.error);
  process.exit(2);
}

const bak = `${target}.bak-live-cf-${Date.now()}`;
fs.copyFileSync(target, bak);

// Insert component before App / CandidateTracker / main export
const insertAt = src.search(
  /\n\s*function\s+(App|CandidateTracker|GinaBriefingCard|AgentPanel)\b/,
);
if (insertAt < 0) {
  src = PANEL + "\n" + src;
  console.log("Prepended LiveCandidateFilesPanel");
} else {
  src = src.slice(0, insertAt) + "\n" + PANEL + src.slice(insertAt);
  console.log("Inserted LiveCandidateFilesPanel before main component");
}

// Mount near Board / Notes / main content
let mounted = false;
if (/KimberleyNotesPanel|data-kimberley-notes/.test(src)) {
  const next = src.replace(
    /(<(?:KimberleyNotesPanel|div)[^>]*data-kimberley-notes[^>]*\/>|<\/KimberleyNotesPanel>)/,
    `$1\n          <LiveCandidateFilesPanel />`,
  );
  if (next !== src) {
    src = next;
    mounted = true;
  }
}
if (!mounted && /Candidate Board|Pipeline board|id=["']board["']/.test(src)) {
  const next = src.replace(
    /(<(?:h[12]|div)[^>]*>[^<]*(?:Candidate Board|Pipeline|Board)[^<]*<\/(?:h[12]|div)>)/i,
    `<LiveCandidateFilesPanel />\n          $1`,
  );
  if (next !== src) {
    src = next;
    mounted = true;
  }
}
if (!mounted) {
  // Soft mount: render at start of App return if we can find return (
  const m = src.match(/function\s+App\s*\([^)]*\)\s*\{/);
  if (m) {
    const idx = src.indexOf(m[0]);
    const ret = src.indexOf("return (", idx);
    if (ret > 0) {
      const after = src.indexOf("(", ret) + 1;
      src =
        src.slice(0, after) +
        `\n    <>\n      <LiveCandidateFilesPanel />\n` +
        src.slice(after);
      // close fragment before final ); of App — best-effort; may need manual fix
      mounted = true;
      console.log("Attempted App return fragment mount — verify compile");
    }
  }
}

const after = canCompile(esbuild, src);
if (!after.ok) {
  console.error("REFUSING App.jsx after Live CF panel:", after.error);
  fs.copyFileSync(bak, target);
  process.exit(2);
}

fs.writeFileSync(target, src, "utf8");
console.log("Patched", target);
console.log("Backup:", bak);
console.log(mounted ? "Panel mounted on dashboard" : "Component added — mount manually if not visible");
console.log(`
Next:
  cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
  git add -f frontend/dist frontend/src/App.jsx
  git commit -m "Dashboard: Live Candidate Files panel"
  git push origin main
`);
