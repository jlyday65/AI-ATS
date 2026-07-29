# Candidate File

Gina creates a **Candidate File** for a client role. Maria fills it with candidates + resumes. Michelle adds screening questions and answers. Kimberley exports a client-ready packet and keeps an archived copy.

## Flow

```
Kimberley → Gina: "fill out the candidate file and send to Maria"
         → create_candidate_file / /ats/candidate-files/from-instruction
         → Candidate File shell + Kimberley Note + Maria queued
Maria → Add candidates + resume text
Michelle → Screening questions + answers
Client  → Review export packet
Archive → .data/candidate-file-archives/
```

Manual entry: ATS toolbar **Candidate File** button → `/candidate-file`

## Mac install (Gina command + page + toolbar)

```bash
cd ~/AI-ATS && git pull origin cursor/ai-ats-b2b-platform-4f1f

# 1) API + page (if not already)
node gina-express/frontend/patch-candidate-files.mjs ~/lyday-gina-backend/gina-backend

# 2) Gina chat: fill Candidate File → Maria
node gina-express/frontend/patch-gina-candidate-file-command.mjs ~/lyday-gina-backend/gina-backend

# 3) ATS toolbar button (manual entry)
node gina-express/frontend/patch-candidate-file-toolbar.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
cd ~/lyday-gina-backend/gina-backend/frontend && npm run build

cd ~/lyday-gina-backend
git add gina-backend/agents gina-backend/lib gina-backend/routes gina-backend/GINA_TEAM_PROMPT_RULE.txt gina-backend/gina.js gina-backend/candidate-file-page.route.js gina-backend/frontend gina-backend/server.js
git status
git commit -m "Candidate File: Gina→Maria command + ATS toolbar button"
git push origin main
```

## URLs (after patch + redeploy)

- UI: `/candidate-file` (also `/candidate-files`)
- API: `/ats/candidate-files`

## API sketch

| Method | Path | Who |
|--------|------|-----|
| `POST` | `/ats/candidate-files` | Gina — create shell |
| `GET` | `/ats/candidate-files` | List |
| `GET` | `/ats/candidate-files/:id` | Load |
| `POST` | `/ats/candidate-files/:id/candidates` | Maria — add candidate + resume |
| `POST` | `/ats/candidate-files/:id/screening-questions` | Michelle |
| `POST` | `/ats/candidate-files/:id/candidates/:cid/answers` | Michelle |
| `POST` | `/ats/candidate-files/:id/export` | Build + archive client packet |
| `GET` | `/ats/candidate-files/:id/export.txt` | Download `.txt` |

## Mac install

If Railway shows **502 Bad Gateway**, roll back first:

```bash
cd ~/AI-ATS && git pull origin cursor/ai-ats-b2b-platform-4f1f
node gina-express/frontend/rollback-candidate-files.mjs ~/lyday-gina-backend/gina-backend
cd ~/lyday-gina-backend
git add gina-backend/server.js gina-backend/gina.js
git commit -m "Rollback Candidate File mount (restore ATS from 502)"
git push origin main
```

Then install the fixed mount (server.js only):

```bash
cd ~/AI-ATS && git pull origin cursor/ai-ats-b2b-platform-4f1f
node gina-express/frontend/patch-candidate-files.mjs ~/lyday-gina-backend/gina-backend
cd ~/lyday-gina-backend
git add gina-backend/lib/candidate-files.js gina-backend/routes/candidate-files.js gina-backend/candidate-file-page.route.js gina-backend/frontend/public/candidate-file.html gina-backend/frontend/candidate-file.html gina-backend/server.js gina-backend/gina.js
git commit -m "Add Candidate File handoff (Gina → Maria → Michelle → client)"
git push origin main
```

Railway Redeploy → open `/candidate-file`.