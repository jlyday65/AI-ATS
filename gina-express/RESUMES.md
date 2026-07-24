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
1. Paste `ResumeUploadPanel` from `frontend/ResumeUploadPanel.jsx` into `App.jsx` (or import it).
2. Add a **Resumes** tab / section and render:
```jsx
<ResumeUploadPanel
  jobs={jobs}
  onDone={() => {
    // call whatever you already use to refresh candidates
    // e.g. loadCandidates();
  }}
/>
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
