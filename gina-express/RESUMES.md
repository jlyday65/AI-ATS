# Resume PDF / text intake (SignalHire → Gina)

SignalHire `/resumes` accepts a PDF or pasted resume text, extracts fields, scores
fit against a job, and pushes into Gina via `/ats/import-candidates` with full
`resumeText`.

## SignalHire

1. Pull latest AI-ATS (`ats-v16+`).
2. Open `http://localhost:3000/resumes`.
3. Select job → upload PDF or paste text → **Ingest resume**.
4. In Gina ATS → Agent → **Check for actions**.

## Gina apply path

Your `import_candidate` handler should persist `resume_text` (see
`apply-import-candidate.snippet.js`).

Optional upgrade: upsert by email so a second upload updates the same candidate
instead of creating a duplicate — see `attach-resume.snippet.js`.

## Maria evaluation

Once resume text is on the Gina candidate record, ask Maria:

> Evaluate Liam Garcia for Warehouse Manager using the resume on their candidate record.

If Maria can’t read ATS fields yet, paste the resume text into chat.
