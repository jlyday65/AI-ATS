# Candidate File

Gina creates a **Candidate File** for a client role. Maria fills it with candidates + resumes. Michelle adds screening questions and answers. Kimberley exports a client-ready packet and keeps an archived copy.

## Flow

```
Gina  → Create file (job title, description, salary, client)
Maria → Add candidates + resume text
Michelle → Screening questions + per-candidate answers
Client  → Review export packet (who to bring in / advance)
Archive → Saved under .data/candidate-file-archives/
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

```bash
cd ~/AI-ATS && git pull origin cursor/ai-ats-b2b-platform-4f1f
node gina-express/frontend/patch-candidate-files.mjs ~/lyday-gina-backend/gina-backend
cd ~/lyday-gina-backend
git add gina-backend/lib/candidate-files.js gina-backend/routes/candidate-files.js gina-backend/candidate-file-page.route.js gina-backend/frontend/public/candidate-file.html gina-backend/frontend/candidate-file.html gina-backend/server.js gina-backend/gina.js
git commit -m "Add Candidate File handoff (Gina → Maria → Michelle → client)"
git push origin main
```

Railway Redeploy → open `/candidate-file`.
