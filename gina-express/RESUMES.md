# Resume upload in Gina ATS (and SignalHire)

You can ingest resumes in **either** place:

| Where | URL / UI | Best for |
|-------|----------|----------|
| **Gina ATS (native)** | Resumes panel in Lyday ATS → `POST /resumes/upload` | Day-to-day recruiting in the ATS |
| **SignalHire** | `http://localhost:3000/resumes` | Sourcing + score-then-push workflow |

---

## A) Add resume upload to Gina (what you asked for)

### 1. Install deps (Gina repo)
```bash
npm install multer pdf-parse
```

### 2. Copy these files into Gina
From AI-ATS `gina-express/`:

| Copy from | To Gina |
|-----------|---------|
| `lib/resumeExtract.js` | `gina-backend/lib/resumeExtract.js` |
| `routes/resumes.js` | `gina-backend/routes/resumes.js` |

### 3. Mount the route in `server.js`
```js
import resumesRouter from "./routes/resumes.js";
// after app.use(requireAppAuth):
app.use("/resumes", resumesRouter);
```

### 4. Add UI in `frontend/App.jsx`
**Important:** define `ResumeUploadPanel` as a **top-level function** (same level as `JobsView` / `ResumeTabPanel`).  
Do **not** paste the function body inside `{view === "jobs" && ( ... )}` — that breaks the file.

1. Paste the `function ResumeUploadPanel(...) { ... }` block **above** `function JobsView`.
2. Keep the Jobs view clean:
```jsx
{view === "jobs" && (
  <JobsView
    jobs={jobs}
    candidates={candidates}
    onAdd={() => setEditingJobId("new")}
    onEdit={(id) => setEditingJobId(id)}
    onViewCandidates={(id) => {
      setJobFilter(id);
      setView("board");
    }}
  />
)}
```
3. Add a **Resumes** nav item + view:
```jsx
{view === "resumes" && (
  <div style={{ padding: 18, overflowY: "auto", flex: 1 }}>
    <ResumeUploadPanel
      jobs={jobs}
      onDone={(data) => {
        // optional: addCandidate from data.candidate so the board updates
      }}
    />
  </div>
)}
```

### 5. Schema check
`candidates` should have (adjust names if yours differ):
- `resume_text`
- `email`, `name`, `phone`, `role`
- `job_id`, `job_title` (optional but recommended)
- `updated_at` (optional — remove from SQL if missing)

### 6. Redeploy Railway → open Lyday ATS → **Resumes** → upload PDF

Matching rule: **same email updates the existing candidate**; otherwise a new candidate is created and linked to the selected job.

Then ask Maria:
> Evaluate \<Name\> for \<Job Title\> using the resume on their candidate record.

---

## B) SignalHire path (still available)

1. `http://localhost:3000/resumes`
2. Upload → push to Gina `/ats/import-candidates`
3. Agent → **Check for actions**

Optional Gina upsert-by-email for SignalHire pushes: `attach-resume.snippet.js`.

---

## Notes
- Text-based PDFs work. Scanned image PDFs need pasted text (OCR not enabled yet).
- Column names in `routes/resumes.js` may need a quick tweak to match your real `candidates` table — check with `\d candidates` / your schema.
