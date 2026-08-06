# Save / Export — Board + Candidate File

One action downloads **Board candidates + Candidate File** as a single `.txt`.
You save that file to your **external drive**. The same people are archived into
AI-ATS **talent pool** so Maria can reuse them when a new job matches their
experience/resume.

## When to save (does not interfere)

**Best stage: after Michelle finishes screening Q&A**, before or when sending to the client.

| Stage | Save? |
| --- | --- |
| Maria still sourcing | Optional backup only (incomplete) |
| **Michelle screening done** | **Yes — recommended** |
| Client review / hire / job close | Also fine — snapshot only |

Export is a **snapshot**. It does **not** clear the Board, lock the Candidate File, or stop Maria/Michelle.

## Who does it

- **You / Gina** — click **Save / Export** (or open `/job-save`)
- **Maria / Michelle** — keep filling the Board / Candidate File; they don’t own the drive save

Gina on Railway cannot write to your Mac external drive. Download → Save As on the drive.

## If Railway crashes: `Cannot find module .../job-save-page.route.js`

Rollback first, push, wait for healthy, then re-install the fixed kit:

```bash
cd ~/AI-ATS && git pull origin cursor/ai-ats-b2b-platform-4f1f
node gina-express/frontend/rollback-job-save-export.mjs ~/lyday-gina-backend/gina-backend
cd ~/lyday-gina-backend
git add gina-backend/server.js
git commit -m "Rollback job-save-page.route import (restore Railway)"
git pull origin main --rebase
git push origin main
```

## Mac install (fixed — no separate page file)

```bash
cd ~/AI-ATS && git pull origin cursor/ai-ats-b2b-platform-4f1f

# API + /job-save page (from routes/job-save-export.js)
node gina-express/frontend/patch-job-save-export.mjs ~/lyday-gina-backend/gina-backend

# ATS Board toolbar button
node gina-express/frontend/patch-job-save-toolbar.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
cd ~/lyday-gina-backend/gina-backend/frontend && npm run build

cd ~/lyday-gina-backend
git add gina-backend/server.js \
        gina-backend/routes/job-save-export.js \
        gina-backend/lib/job-save-export.js \
        gina-backend/frontend/job-save.html \
        gina-backend/frontend/public/job-save.html \
        gina-backend/frontend/src/App.jsx \
        gina-backend/frontend/dist
git status   # confirm routes + lib are staged — not only server.js
git commit -m "Save/Export Board + Candidate File; talent pool for Maria"
git pull origin main --rebase
git push origin main
```

Railway Gina needs `SIGNALHIRE_BASE_URL` + `RELAY_SECRET` (same as Maria).
AI-ATS must be running (`npm run dev` + ngrok) so archive → talent pool succeeds.

## AI-ATS (Maria reuse)

Already on the AI-ATS branch:

- `POST /api/talent-pool/archive` — Gina Save/Export posts people here
- Maria `POST /api/maria/source` merges matching talent-pool people **before** live/demo search

Matching uses prior job title, skills, location, and resume/JD overlap.

## URLs

| Path | Purpose |
| --- | --- |
| ATS toolbar **Save / Export** | Download from live Board + matching Candidate File |
| `/job-save` | Manual save page |
| `POST /ats/job-save-export` | JSON result |
| `POST /ats/job-save-export.txt` | Direct download |
