# Gina team: Kimberley → Gina → Maria / Michelle / Kelley / Ashton

| Person | Role | Route | What they do |
|--------|------|-------|----------------|
| **Kimberley** | Operator | — | Issues requests to Gina |
| **Gina** | Orchestrator | `/chat` | Queues commands for the four bots |
| **Maria** | Sourcer | `/maria` | SignalHire sourcing + resume-on-file shortlists |
| **Michelle** | Screener | `/michelle` | Resume/job screening, stage recommendations |
| **Kelley** | Pipeline ops | `/kelly` | Stages, notes, ATS housekeeping (alias: Kelly) |
| **Ashton** | Outreach | `/ashton` | Candidate/client outreach drafts + follow-ups |

## Candidate File (Gina → Maria → Michelle → client)

Create a shared packet per requisition:

1. **Gina** opens `/candidate-file` → Create (job title, description, salary, client)
2. **Maria** adds candidates + resume text on that file
3. **Michelle** saves screening questions and per-candidate answers
4. **Export for client & save** → downloadable `.txt` + archive under `.data/candidate-file-archives/`

Install on Gina:

```bash
cd ~/AI-ATS && git pull origin cursor/ai-ats-b2b-platform-4f1f
node gina-express/frontend/patch-candidate-files.mjs ~/lyday-gina-backend/gina-backend
```

See `CANDIDATE-FILE.md`.

## Sound communication contract

```
Kimberley → Gina (/chat) queues command_agent | source_candidates_signalhire
         → Agent → Check for actions → POST /ats/run-command (executeNow)
              → Maria     → SignalHire → board import + Kimberley note
              → Michelle  → screening update note (+ handoff to Kelley/Ashton)
              → Kelley    → pipeline ops note (+ handoff)
              → Ashton    → outreach note (+ handoff)
         → Kimberley's Notes panel + morning Pipeline Stage Counts briefing
```

Rules implemented in code:
1. **Queue ≠ execute** — Gina queuing only files a short ack. Work runs on Check for actions.
2. **One note per action** — execute replaces the ack for the same `actionId`.
3. **No silent Maria default** — `command_agent` requires `targetAgent`.
4. **Maria errors still file a note** — so Kimberley sees the break (relay/env) instead of silence.
5. **Every working reply includes Handoff** — who acts next (Michelle → Kelley → Ashton, etc.).

## Bring Kimberley's Notes back (safe)

After emergency disable (white screen), use the one-shot bring-back — **not** the old `patch-kimberley-notes.mjs` alone:

```bash
cd ~/AI-ATS
git pull origin cursor/ai-ats-b2b-platform-4f1f

node gina-express/frontend/bring-back-team-comms.mjs /Users/jameslyday/lyday-gina-backend/gina-backend

cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
cd ~/lyday-gina-backend/gina-backend
git add agents lib routes maria-source.tool.js briefing GINA_TEAM_PROMPT_RULE.txt frontend/src/App.jsx server.js
git status
git commit -m "Restore team comms: Kimberley Notes + queue/execute handoffs"
git push origin main
```

Railway → Redeploy. Open **Kimberley's Notes** → **Refresh**.

## Soundness check (new chat)

Ask Gina (one at a time or as a short batch):

```text
Ask Maria to source a Warehouse Mechanic in Atlanta, GA. All candidates must have a resume on file.
Have Michelle screen the Warehouse Mechanic candidates that just came in.
Tell Kelley to move Ava Chen to Screening and note "Kimberley requested".
Get Ashton to draft a follow-up email to "Ava Chen".
```

Then: **Agent → Check for actions** → **Kimberley's Notes → Refresh**.

Expect:
- Maria note with shortlist / SignalHire status (or a clear env error)
- Michelle / Kelley / Ashton notes with **Handoff** lines
- No duplicate ack+result for the same action
- No “No candidate found matching Maria”

## Fix: Gina says she only has three ATS actions

```bash
cd ~/AI-ATS && git pull origin cursor/ai-ats-b2b-platform-4f1f
node gina-express/frontend/inspect-and-fix-gina-js.mjs ~/lyday-gina-backend/gina-backend/gina.js
```

Commit/push that Gina repo, confirm Railway root dir, redeploy, **new chat**.

## Fix: Check for actions skips Maria / unknown action type

```bash
cd ~/AI-ATS && git pull origin cursor/ai-ats-b2b-platform-4f1f
node gina-express/frontend/patch-apply-command-actions.mjs ~/lyday-gina-backend
cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
```

Railway: `SIGNALHIRE_BASE_URL` + `RELAY_SECRET`. Redeploy, re-ask Gina, Check for actions.

## Env (Railway Gina)

- `RELAY_SECRET` — shared with SignalHire  
- `SIGNALHIRE_BASE_URL` — SignalHire public URL (Maria)

## Files

| File | Purpose |
|------|---------|
| `agents/registry.js` | Canonical bot list + aliases |
| `agents/command-agent.tool.js` | Queue vs execute `command_agent` |
| `agents/bot-replies.js` | Ack + working replies with handoffs |
| `lib/kimberley-notes.js` | Notes store + upsert by actionId |
| `routes/run-command.js` | Check for actions executor |
| `routes/kimberley-notes.js` | Notes + briefing API |
| `frontend/bring-back-team-comms.mjs` | Sync files + safe Notes re-enable |
| `frontend/reenable-kimberley-notes.mjs` | Notes panel + error boundary only |
| `GINA_TEAM_PROMPT_RULE.txt` | Paste into Gina system prompt |
| `MARIA.md` | Maria sourcing details |
