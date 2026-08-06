# Candidate File (LIVE)

Gina creates a **live Candidate File** for a client role. Bots keep it current automatically:

| Bot | Updates the file with |
|-----|------------------------|
| **Maria** | Candidates + resume text (on source / Board import) |
| **Michelle** | Screening questions (+ answers when recorded) |
| **Kelley** | Stage moves |
| **Ashton** | Candidate notes |

Kimberley **views anytime** and edits only when needed — she should not fill the file from scratch.

The file stays **LIVE** until Kimberley:

- **Send to client** (export + freeze → status `sent`), or
- **Cancel**, or
- **Delete**

Every bot update also dual-files **Kimberley's Notes** and **Gina's pipeline Team updates**.

## Where to open

- ATS **dashboard** → Live Candidate Files panel
- Toolbar **Candidate File** → `/candidate-file`
- Deep link: `/candidate-file?id=<cfId>`
- API: `/ats/candidate-files` · `/ats/candidate-files/live`

## Flow

```
Kimberley → Gina: create Candidate File (+ send to Maria)
         → LIVE file shell + Note + Maria queued
Maria    → shortlist → Board + Candidate File (auto)
Michelle → screening Qs/answers → Candidate File (auto)
Kelley   → stage moves → Candidate File (auto)
Ashton   → notes → Candidate File (auto)
Kimberley → review on dashboard /candidate-file → Send to client (freeze)
Archive  → .data/candidate-file-archives/
```

## Mac install

```bash
cd ~/AI-ATS && git pull origin cursor/live-candidate-file-4f1f
bash gina-express/frontend/APPLY-LIVE-CANDIDATE-FILE.sh ~/lyday-gina-backend
```

## API sketch

| Method | Path | Who |
|--------|------|-----|
| `POST` | `/ats/candidate-files` | Gina — create live shell |
| `GET` | `/ats/candidate-files/live` | Dashboard — live files only |
| `GET` | `/ats/candidate-files/:id` | Load |
| `POST` | `/ats/candidate-files/sync` | Board/bots — stage/note/candidate sync |
| `POST` | `/ats/candidate-files/upsert-candidates` | Maria bulk shortlist |
| `POST` | `/ats/candidate-files/:id/candidates` | Add/override candidate |
| `POST` | `/ats/candidate-files/:id/screening-questions` | Michelle |
| `POST` | `/ats/candidate-files/:id/candidates/:cid/answers` | Michelle |
| `POST` | `/ats/candidate-files/:id/export` | Preview packet (**stays live**) |
| `POST` | `/ats/candidate-files/:id/send` | Freeze + send to client |
| `POST` | `/ats/candidate-files/:id/cancel` | Cancel |
| `DELETE` | `/ats/candidate-files/:id` | Soft delete |
| `GET` | `/ats/candidate-files/:id/export.txt` | Download `.txt` |

## Statuses

- Live: `draft` · `sourcing` · `screening` · `ready`
- Closed: `sent` · `canceled` · `deleted`
