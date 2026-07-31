/**
 * Self-contained Board + Candidate File Save/Export for Gina.
 * Lives NEXT TO server.js (Railway /app/job-save-ats.js) so one file deploy works.
 *
 *   import jobSaveAts, { mountJobSaveAts } from "./job-save-ats.js";
 *   app.use("/ats", jobSaveAts);
 *   mountJobSaveAts(app);
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { Router } from "express";

const ARCHIVE_DIR = path.join(process.cwd(), ".data", "job-save-exports");

function now() {
  return new Date().toISOString();
}

function safeName(value = "") {
  return String(value || "job")
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 48);
}

function normalizeBoardCandidate(c = {}) {
  return {
    id: c.id || `board_${randomUUID().slice(0, 8)}`,
    name: String(c.name || c.fullName || "").trim(),
    email: String(c.email || "").trim(),
    phone: String(c.phone || "").trim(),
    role: String(c.role || c.headline || c.jobTitle || "").trim(),
    location: String(c.location || "").trim(),
    source: String(c.source || "Board").trim(),
    stage: String(c.stage || c.status || "new").trim(),
    resumeText: String(c.resumeText || c.resume || "").trim(),
    notes: String(c.notes || "").trim(),
  };
}

function buildBoardSection(jobTitle, boardCandidates = []) {
  const lines = [];
  lines.push("BOARD CANDIDATES");
  lines.push("=".repeat(40));
  lines.push(`Job: ${jobTitle || "(untitled)"}`);
  lines.push(`Count: ${boardCandidates.length}`);
  lines.push(
    `Exported: ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}`,
  );
  lines.push("");
  if (!boardCandidates.length) {
    lines.push("(No board candidates included in this save.)");
    return lines.join("\n");
  }
  boardCandidates.forEach((c, idx) => {
    lines.push(`BOARD CANDIDATE ${idx + 1}: ${c.name}`);
    lines.push("-".repeat(40));
    if (c.role) lines.push(`Role / headline: ${c.role}`);
    if (c.email) lines.push(`Email: ${c.email}`);
    if (c.phone) lines.push(`Phone: ${c.phone}`);
    if (c.location) lines.push(`Location: ${c.location}`);
    if (c.source) lines.push(`Source: ${c.source}`);
    if (c.stage) lines.push(`Stage: ${c.stage}`);
    if (c.notes) {
      lines.push("Notes:");
      lines.push(c.notes);
    }
    lines.push("Resume:");
    lines.push(c.resumeText || "(resume not on file)");
    lines.push("");
  });
  return lines.join("\n");
}

async function tryLoadCandidateFile(jobTitle, candidateFileId) {
  try {
    const mod = await import("./lib/candidate-files.js");
    const store = mod.candidateFiles || mod.default;
    if (!store) return null;
    if (candidateFileId && store.getFile) {
      return await store.getFile(candidateFileId);
    }
    if (jobTitle && store.listFiles) {
      const files = await store.listFiles({ limit: 100 });
      const want = jobTitle.trim().toLowerCase();
      return (
        files.find(
          (f) => String(f.job?.title || "").trim().toLowerCase() === want,
        ) || null
      );
    }
  } catch {
    return null;
  }
  return null;
}

async function tryBuildClientExport(file) {
  try {
    const mod = await import("./lib/candidate-files.js");
    if (typeof mod.buildClientExport === "function") {
      return mod.buildClientExport(file);
    }
    if (mod.candidateFiles?.exportForClient) {
      const exported = await mod.candidateFiles.exportForClient(file.id, {
        saveArchive: true,
        label: "Combined job save",
      });
      return exported?.text || "";
    }
  } catch {
    // fall through
  }
  return [
    "CANDIDATE FILE",
    "=".repeat(40),
    `Job: ${file?.job?.title || "(unknown)"}`,
    `Candidates: ${file?.candidates?.length || 0}`,
    "(Full Candidate File export unavailable — board section still saved.)",
    "",
  ].join("\n");
}

function mergePeople(boardCandidates = [], fileCandidates = []) {
  const map = new Map();
  for (const c of [...boardCandidates, ...fileCandidates]) {
    const name = String(c.name || c.fullName || "").trim();
    if (!name) continue;
    const key = (c.email || name).toLowerCase();
    const prev = map.get(key) || {};
    map.set(key, {
      name,
      fullName: name,
      email: c.email || prev.email || "",
      phone: c.phone || prev.phone || "",
      role: c.role || c.headline || prev.role || "",
      headline: c.headline || c.role || prev.headline || "",
      location: c.location || prev.location || "",
      source: c.source || prev.source || "",
      stage: c.stage || prev.stage || "",
      resumeText: c.resumeText || c.resume || prev.resumeText || "",
    });
  }
  return [...map.values()];
}

function resolveSignalHireBaseUrl() {
  const raw = (
    process.env.SIGNALHIRE_BASE_URL ||
    process.env.AI_ATS_BASE_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");
  if (!raw) return "";
  return raw.includes("://") ? raw : `https://${raw}`;
}

async function pushToTalentPool(payload) {
  const base = resolveSignalHireBaseUrl();
  const secret = (
    process.env.RELAY_SECRET ||
    process.env.GINA_RELAY_SECRET ||
    ""
  ).trim();
  if (!base || !secret || !payload.candidates?.length) {
    return {
      ok: false,
      skipped: true,
      reason: !base
        ? "SIGNALHIRE_BASE_URL unset"
        : !secret
          ? "RELAY_SECRET unset"
          : "no candidates",
    };
  }
  const url = `${base}/api/talent-pool/archive`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Relay-Secret": secret,
      },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: json.error || text.slice(0, 240),
        url,
      };
    }
    return { ok: true, url, ...json };
  } catch (err) {
    return { ok: false, error: err?.message || String(err), url };
  }
}

export async function saveBoardAndCandidateFile(input = {}) {
  const jobTitle = String(input.jobTitle || input.roleTitle || "").trim();
  if (!jobTitle) throw new Error("jobTitle is required");

  const boardCandidates = (input.boardCandidates || [])
    .map(normalizeBoardCandidate)
    .filter((c) => c.name);

  const file = await tryLoadCandidateFile(jobTitle, input.candidateFileId);
  let candidateFileText = "";
  if (file) {
    candidateFileText = await tryBuildClientExport(file);
  } else {
    candidateFileText = [
      "CANDIDATE FILE",
      "=".repeat(40),
      `(No Candidate File found for "${jobTitle}". Board section still saved.)`,
      "",
    ].join("\n");
  }

  const boardText = buildBoardSection(jobTitle, boardCandidates);
  const header = [
    "LYDAY TALENT — JOB SAVE / EXPORT",
    "=".repeat(40),
    `Job: ${jobTitle}`,
    input.clientName ? `Client: ${input.clientName}` : null,
    input.location ? `Location: ${input.location}` : null,
    `Saved at: ${now()}`,
    "Contents: Board candidates + Candidate File packet",
    "Use: download this .txt and Save As to your external drive.",
    "",
    "",
  ]
    .filter(Boolean)
    .join("\n");

  const text = `${header}${boardText}\n\n${"-".repeat(40)}\n\n${candidateFileText}\n`;

  let archivePath = null;
  if (input.saveLocalArchive !== false) {
    try {
      if (!existsSync(ARCHIVE_DIR)) mkdirSync(ARCHIVE_DIR, { recursive: true });
      const fname = `${safeName(jobTitle)}_${Date.now()}.txt`;
      writeFileSync(path.join(ARCHIVE_DIR, fname), text, "utf8");
      archivePath = path.join(".data", "job-save-exports", fname);
    } catch {
      // ignore
    }
  }

  const people = mergePeople(boardCandidates, file?.candidates || []);
  let talentPool = { ok: false, skipped: true };
  if (input.pushToTalentPool !== false) {
    talentPool = await pushToTalentPool({
      jobTitle,
      jobDescription: input.jobDescription || file?.job?.description || "",
      location: input.location || file?.job?.location || "",
      clientName: input.clientName || file?.clientName || "",
      label: input.label || "job_save_export",
      candidates: people,
    });
  }

  return {
    ok: true,
    jobTitle,
    candidateFileId: file?.id || null,
    boardCount: boardCandidates.length,
    candidateFileCount: file?.candidates?.length || 0,
    peopleArchived: people.length,
    archivePath,
    talentPool,
    text,
    filename: `job-save-${safeName(jobTitle)}.txt`,
    whenToSave:
      "Best after Michelle finishes screening — export is a snapshot and does not clear the Board or stop Maria.",
  };
}

const PAGE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Save Board + Candidate File</title>
<style>
body{font-family:system-ui,sans-serif;max-width:720px;margin:32px auto;padding:0 16px;color:#1c2b28;background:#f3f7f5}
main{background:#fff;border:1px solid #d7e0dc;border-radius:16px;padding:24px}
label{display:block;font-weight:600;margin:14px 0 6px}
input,textarea{width:100%;padding:10px;border:1px solid #d7e0dc;border-radius:10px;font:inherit;box-sizing:border-box}
textarea{min-height:100px}
button{margin-top:18px;background:#2f6459;color:#fff;border:0;border-radius:10px;padding:12px 16px;font:inherit;cursor:pointer}
.hint{margin-top:14px;padding:12px;background:#eef6f3;border-radius:10px}
</style></head><body><main>
<h1>Save Board + Candidate File</h1>
<p>Best after Michelle finishes screening. Downloads one .txt — save it to your external drive. People also archive for Maria on similar jobs.</p>
<label>Job title</label><input id="jobTitle" placeholder="Warehouse Mechanic"/>
<label>Location (optional)</label><input id="location"/>
<label>Job description (optional)</label><textarea id="jobDescription"></textarea>
<label>Board candidates JSON (optional if using ATS Save button)</label>
<textarea id="boardJson" placeholder='[{"name":"Alex","email":"a@x.com","resumeText":"..."}]'></textarea>
<button id="saveBtn" type="button">Download Save / Export</button>
<div class="hint">Snapshot only — does not clear the Board.</div>
<pre id="status"></pre>
</main>
<script>
document.getElementById("saveBtn").onclick=async()=>{
  const status=document.getElementById("status");
  status.textContent="Saving…";
  let boardCandidates=[];
  const raw=document.getElementById("boardJson").value.trim();
  if(raw){try{boardCandidates=JSON.parse(raw);}catch(e){status.textContent="Bad JSON: "+e.message;return;}}
  const jobTitle=document.getElementById("jobTitle").value.trim();
  if(!jobTitle){status.textContent="Job title required";return;}
  const body={jobTitle,location:document.getElementById("location").value.trim(),jobDescription:document.getElementById("jobDescription").value.trim(),boardCandidates,pushToTalentPool:true};
  try{
    const res=await fetch("/ats/job-save-export.txt",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const text=await res.text();
    if(!res.ok){status.textContent="Failed: "+text;return;}
    const blob=new Blob([text],{type:"text/plain;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download="job-save-"+jobTitle.replace(/[^\\w.-]+/g,"_").slice(0,40)+".txt";
    document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
    status.textContent="Downloaded. Save the file to your external drive.";
  }catch(e){status.textContent=String(e.message||e);}
};
</script></body></html>`;

export function createJobSaveExportRouter() {
  const router = Router();

  router.get("/job-save-export", (_req, res) => {
    res.json({
      ok: true,
      endpoint: "POST /ats/job-save-export",
      download: "POST /ats/job-save-export.txt",
      page: "/job-save",
      stageHint:
        "Save after Michelle finishes screening. Snapshot only — does not clear Board.",
    });
  });

  router.post("/job-save-export", async (req, res) => {
    try {
      const result = await saveBoardAndCandidateFile(req.body || {});
      if (req.query.download === "1" || req.body?.download === true) {
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${result.filename}"`,
        );
        return res.type("text/plain").send(result.text);
      }
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ ok: false, error: String(err?.message || err) });
    }
  });

  router.post("/job-save-export.txt", async (req, res) => {
    try {
      const result = await saveBoardAndCandidateFile(req.body || {});
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${result.filename}"`,
      );
      res.type("text/plain").send(result.text);
    } catch (err) {
      res.status(400).type("text").send(String(err?.message || err));
    }
  });

  return router;
}

export function mountJobSaveAts(app) {
  if (!app || typeof app.get !== "function" || app.__jobSaveAtsMounted) return;
  const send = (_req, res) => res.status(200).type("html").send(PAGE_HTML);
  app.get("/job-save", send);
  app.get("/job-save.html", send);
  app.__jobSaveAtsMounted = true;
  console.log("[job-save] page route: /job-save (job-save-ats.js)");
}

/** @deprecated alias */
export const mountJobSavePage = mountJobSaveAts;

const router = createJobSaveExportRouter();
export default router;
