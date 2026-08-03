#!/usr/bin/env node
/**
 * Restore Education on ATS candidate profiles.
 *
 * - Persists `education` on addCandidate / import
 * - Shows an Education block above the Resume panel
 * - Falls back to parsing EDUCATION from resumeText when field is empty
 * - esbuild-gated (will not leave a white-screen App.jsx)
 *
 * Usage:
 *   node gina-express/frontend/patch-show-resume-education.mjs ~/lyday-gina-backend/gina-backend
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const rootArg = String(process.argv[2] || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");
if (!rootArg) {
  console.error(
    "Usage: node patch-show-resume-education.mjs ~/lyday-gina-backend/gina-backend",
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
  process.exit(1);
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
const before = src;
const bak = `${appPath}.bak-education-${Date.now()}`;
fs.copyFileSync(appPath, bak);

const esbuild = loadEsbuild();
const beforeCompile = canCompile(esbuild, src);
if (!beforeCompile.ok) {
  console.error("App.jsx does not compile before education patch:", beforeCompile.error);
  console.error("Run: node gina-express/frontend/fix-ats-white-screen.mjs ~/lyday-gina-backend/gina-backend");
  process.exit(2);
}

const HELPER = `
function candidateEducationText(c) {
  if (!c || typeof c !== "object") return "";
  const direct = String(c.education || c.educationText || "").trim();
  if (direct) return direct;
  const resume = String(c.resumeText || c.resume_text || "");
  const m = resume.match(/(?:^|\\n)\\s*EDUCATION\\s*\\n([\\s\\S]*?)(?=\\n\\s*(?:SKILLS|EXPERIENCE|SUMMARY|CERTIFICATIONS|PROJECTS|AWARDS)\\s*\\n|$)/i);
  if (!m) return "";
  return m[1]
    .split("\\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\\n");
}
if (typeof window !== "undefined") {
  window.candidateEducationText = candidateEducationText;
}
`;

if (!src.includes("function candidateEducationText(")) {
  const marker = "export default function App()";
  const idx = src.indexOf(marker);
  const alt = src.search(/function\s+(?:App|CandidateTracker)\b/);
  const at = idx >= 0 ? idx : alt;
  if (at < 0) {
    console.error("Could not find App() to inject education helper");
    process.exit(2);
  }
  // Never insert above import statements
  const importAt = src.search(/^import\s/m);
  if (importAt >= 0 && at < importAt) {
    console.error("REFUSING: App() appears before imports — file is corrupt");
    process.exit(2);
  }
  src = src.slice(0, at) + HELPER + "\n" + src.slice(at);
  console.log("Injected candidateEducationText helper");
} else {
  console.log("candidateEducationText already present");
}

if (/function addCandidate\s*\(/.test(src) && !/education:\s*data\.education/.test(src)) {
  if (/resumeText:\s*data\.resumeText/.test(src)) {
    src = src.replace(
      /resumeText:\s*data\.resumeText\s*\|\|\s*data\.resume_text\s*\|\|\s*""/,
      `resumeText: data.resumeText || data.resume_text || "",
      education: data.education || data.educationText || ""`,
    );
    console.log("Persisted education on addCandidate");
  } else if (/role:\s*data\.role/.test(src)) {
    src = src.replace(
      /role:\s*data\.role([^,\n]*)/,
      `role: data.role$1,
      education: data.education || data.educationText || ""`,
    );
    console.log("Persisted education near role on addCandidate");
  }
}

if (
  /resumeText:\s*payload\.resumeText/.test(src) &&
  !/education:\s*payload\.education/.test(src)
) {
  src = src.replace(
    /resumeText:\s*payload\.resumeText\s*\|\|\s*payload\.resume_text\s*\|\|\s*payload\.summary\s*\|\|\s*""/g,
    `resumeText: payload.resumeText || payload.resume_text || payload.summary || "",
          education: payload.education || payload.educationText || ""`,
  );
  console.log("Import path keeps education");
}

const EDU_BLOCK = `
        {(typeof candidateEducationText === "function"
            ? candidateEducationText(active)
            : typeof window !== "undefined" && typeof window.candidateEducationText === "function"
              ? window.candidateEducationText(active)
              : "") ? (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: "#5C584C" }}>Education</div>
            <pre style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontSize: 12.5,
              lineHeight: 1.45,
              background: "#F7F6F1",
              border: "1px solid #E6E2D6",
              borderRadius: 8,
              padding: 12,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              color: "#2C2A24",
            }}>{typeof candidateEducationText === "function" ? candidateEducationText(active) : window.candidateEducationText(active)}</pre>
          </div>
        ) : null}
`;

if (/candidateEducationText\(active\)/.test(src) && /Education<\/div>/.test(src)) {
  console.log("Education UI already present");
} else if (/\(active\.resumeText\s*\|\|\s*active\.resume_text\)/.test(src)) {
  src = src.replace(
    /\{\(active\.resumeText\s*\|\|\s*active\.resume_text\)\s*\?\s*\(/,
    `${EDU_BLOCK.trim()}\n        {(active.resumeText || active.resume_text) ? (`,
  );
  console.log("Inserted Education block above Resume panel");
} else if (/\bactive\.summary\b/.test(src)) {
  const idx = src.search(/\{active\.summary\}|active\.summary\s*&&|\{active\.summary\s*\|\|/);
  if (idx >= 0) {
    const lineEnd = src.indexOf("\n", idx);
    src = src.slice(0, lineEnd + 1) + EDU_BLOCK + src.slice(lineEnd + 1);
    console.log("Inserted Education block after summary");
  }
} else {
  console.warn("Could not auto-place Education UI — helper/persist still applied");
}

const after = canCompile(esbuild, src);
if (!after.ok) {
  console.error("REFUSING: education patch would break App.jsx:", after.error);
  fs.copyFileSync(bak, appPath);
  process.exit(2);
}

if (src === before) {
  console.log("No textual changes");
} else {
  fs.writeFileSync(appPath, src, "utf8");
  console.log("Wrote", appPath);
}
console.log("Backup:", bak);
console.log(`
Next:
  cd ${path.join(ginaDir, "frontend")} && npm run build
  cd ${path.dirname(ginaDir)}
  git add gina-backend/frontend/src/App.jsx
  git commit -m "ATS candidate profile: show Education on resume"
  git pull origin main --rebase && git push origin main
`);
