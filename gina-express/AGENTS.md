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

After a nuclear App.jsx restore, re-wire handlers (esbuild-gated):

```bash
cd ~/AI-ATS && git pull origin cursor/ai-ats-b2b-platform-4f1f
node gina-express/frontend/patch-check-for-actions.mjs ~/lyday-gina-backend/gina-backend
cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
```

Then commit `gina-backend/frontend/src/App.jsx` (+ routes/agents/lib if copied), `git pull origin main --rebase`, `git push origin main`.

If the patch says `Expected "(" but found "applyAgentAction"`, pull again — that was a bad await rewriter (fixed). Do **not** skip the patch; Check for actions will keep saying Unknown action type without it.

Also restore toolbar + Gina/bot branding after nuclear restore:

```bash
node gina-express/frontend/patch-ats-toolbar-links.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
node gina-express/frontend/patch-bot-nav-branding.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
```

Nav labels become: 👩🏿 Gina · 👩🏻 Maria · 👩🏾 Michelle · 👩🏼 Kelley · 👨 Ashton

## Fix: Chat HTTP 500 `{"error":"pool is not defined"}`

Gina chat tried to queue an Ashton/Maria/etc. action but `gina.js` used `pool` without importing it (often after nuclear restore).

```bash
cd ~/AI-ATS && git pull origin cursor/ai-ats-b2b-platform-4f1f
node gina-express/frontend/fix-gina-pool-undefined.mjs ~/lyday-gina-backend/gina-backend
node --check ~/lyday-gina-backend/gina-backend/gina.js
cd ~/lyday-gina-backend
git add gina-backend/gina.js gina-backend/server.js gina-backend/lib
git status
git commit -m "Fix pool is not defined in Gina chat/queue path"
git pull origin main --rebase
git push origin main
```

Then retest: "Gina please get an update from Ashton on his projects"

## Fix: Railway `Unexpected identifier 'task'` in gina.js

Orphan Candidate File / TEAM prompt prose (with backticks around 'task') was pasted into `gina.js` outside a string.

```bash
cd ~/AI-ATS && git pull origin cursor/ai-ats-b2b-platform-4f1f
node gina-express/frontend/repair-gina-js-syntax.mjs ~/lyday-gina-backend/gina-backend
node --check ~/lyday-gina-backend/gina-backend/gina.js
cd ~/lyday-gina-backend
git add gina-backend/gina.js
git status
git commit -m "Repair gina.js prompt syntax (Candidate File / TEAM rules)"
git pull origin main --rebase
git push origin main
```

Prompt patches now inject rules only via `const GINA_TEAM_RULES = \`...\`` (never raw paste).

## Fix: Railway `Cannot find module '/app/routes/agents/command-agent.tool.js'`

`routes/candidate-files.js` (or another route) imported `./agents/...` instead of `../agents/...`.

```bash
cd ~/AI-ATS && git pull origin cursor/ai-ats-b2b-platform-4f1f
node gina-express/frontend/fix-routes-agent-imports.mjs ~/lyday-gina-backend/gina-backend
node --check ~/lyday-gina-backend/gina-backend/routes/candidate-files.js
cd ~/lyday-gina-backend
git add gina-backend/routes gina-backend/agents gina-backend/lib
git status
git commit -m "Fix routes agent import paths (../agents not ./agents)"
git pull origin main --rebase
git push origin main
```

## Fix: Railway `Unexpected identifier 'TEAM'` in webhooks.js

Orphan **TEAM BOT UPDATE RULE** / **GINA TEAM COMMAND RULE** prose was pasted into `routes/webhooks.js` (not inside a string). Strip it:

```bash
cd ~/AI-ATS && git pull origin cursor/ai-ats-b2b-platform-4f1f
node gina-express/frontend/repair-js-orphan-prose.mjs ~/lyday-gina-backend/gina-backend
node --check ~/lyday-gina-backend/gina-backend/routes/webhooks.js
cd ~/lyday-gina-backend
git add gina-backend/routes/webhooks.js
git status
git commit -m "Strip orphan TEAM prompt prose from webhooks.js"
git pull origin main --rebase
git push origin main
```

Team prompt patches now **skip `routes/` and `webhooks.js`** so this does not repeat.

## Fix: Bot updates must hit Notes AND pipeline summary

Every bot Check-for-actions reply (Maria / Michelle / Kelley / Ashton) is dual-filed:

1. **Kimberley's Notes** (full text)
2. **Gina pipeline summary → Team updates (Kimberley Notes)**

```bash
cd ~/AI-ATS && git pull origin cursor/ai-ats-b2b-platform-4f1f
node gina-express/frontend/patch-kelley-updates.mjs ~/lyday-gina-backend/gina-backend
cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
```

Then commit agents/routes/briefing/lib/gina.js (+ App.jsx/server.js if patched), pull --rebase, push, Railway redeploy.

Retest (new Gina chat):
1. Ask Gina for an update from any bot → Check for actions → Kimberley Notes
2. Ask Gina: Give me the pipeline summary → expect that bot under Team updates

## Fix: Kelley update must hit Notes AND pipeline summary

Kelley’s Check-for-actions reply is dual-filed (same as all bots — use patch above).

## Fix: Kelley update missing from Gina pipeline summary

```bash
cd ~/AI-ATS && git pull origin cursor/ai-ats-b2b-platform-4f1f
node gina-express/frontend/patch-pipeline-include-team-updates.mjs ~/lyday-gina-backend/gina-backend
cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
```

Then commit `gina.js` + briefing/routes/lib (+ App.jsx if patched), pull --rebase, push, Railway redeploy.

Retest: Ask any bot for an update → Check for actions → ask Gina for pipeline summary → expect **Team updates (Kimberley Notes)** to list them.

Railway: `SIGNALHIRE_BASE_URL` + `RELAY_SECRET`. Redeploy, re-ask Gina, Check for actions.

## Fix: Vite build `Expected ";" but found "TEAM"`

Orphan **GINA TEAM COMMAND RULE** prose was pasted into `App.jsx` (not a string). Strip it, then rebuild:

```bash
cd ~/AI-ATS && git pull origin cursor/ai-ats-b2b-platform-4f1f
node gina-express/frontend/strip-app-jsx-prose.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
```

If build still fails, nuclear-restore + re-patch Check for actions + toolbar:

```bash
node gina-express/frontend/nuclear-restore-app-jsx.mjs ~/lyday-gina-backend/gina-backend
node gina-express/frontend/patch-check-for-actions.mjs ~/lyday-gina-backend/gina-backend
node gina-express/frontend/patch-ats-toolbar-links.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
```

`patch-gina-team-commands.mjs` / `patch-gina-chat-tools.mjs` now **skip `*.jsx`** so this does not repeat.

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
