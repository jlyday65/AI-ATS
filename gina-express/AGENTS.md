# Gina team: Kimberley → Gina → Maria / Michelle / Kelley / Ashton

| Person | Role | Route | What they do |
|--------|------|-------|----------------|
| **Kimberley** | Operator | — | Issues requests to Gina |
| **Gina** | Orchestrator | `/chat` | Commands the four bots |
| **Maria** | Sourcer | `/maria` | SignalHire sourcing + resume-on-file shortlists |
| **Michelle** | Screener | `/michelle` | Resume/job screening, stage recommendations |
| **Kelley** | Pipeline ops | `/kelly` | Stages, notes, ATS housekeeping (alias: Kelly) |
| **Ashton** | Outreach | `/ashton` | Candidate/client outreach drafts + follow-ups |

## Fix: Gina says she only has three ATS actions

If Gina refuses Maria sourcing (“three specific actions” / “outside the scope”),
the prompt rule file may exist while **`gina.js` tool enum** still only lists three actions —
or Railway may be deploying a duplicate folder (`gina-backend 4`, nested copy, etc.).

```bash
curl -fsSL https://raw.githubusercontent.com/jlyday65/AI-ATS/cursor/ai-ats-b2b-platform-4f1f/gina-express/frontend/inspect-and-fix-gina-js.mjs \
  -o /tmp/inspect-and-fix-gina-js.mjs

node /tmp/inspect-and-fix-gina-js.mjs ~/lyday-gina-backend/gina-backend/gina.js
```

Then commit/push **that** `gina-backend`, confirm Railway root dir matches, redeploy, and start a **new** chat.

## Fix: “Skipped action: Unknown action type source_candidates_signalhire”

Gina queued Maria correctly; Check for actions must handle that type via `/ats/run-command`.

```bash
curl -fsSL "https://raw.githubusercontent.com/jlyday65/AI-ATS/cursor/ai-ats-b2b-platform-4f1f/gina-express/frontend/patch-apply-command-actions.mjs" -o /tmp/patch-apply-command-actions.mjs
node /tmp/patch-apply-command-actions.mjs /Users/jameslyday/lyday-gina-backend
cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
cd ~/lyday-gina-backend/gina-backend
git add frontend/src/App.jsx routes/run-command.js agents server.js maria-source.tool.js
git status   # review; do not add node_modules
git commit -m "Handle source_candidates_signalhire in Check for actions"
git push origin main
```

Railway: set `SIGNALHIRE_BASE_URL` + `RELAY_SECRET`. Redeploy, then Check for actions again (or re-queue).

## Fix: “Skipped action: No candidate found matching {name: Maria}”

Gina queued a note/stage against bot name **Maria**. Check for actions must run
`command_agent` via `/ats/run-command` instead.

```bash
curl -fsSL https://raw.githubusercontent.com/jlyday65/AI-ATS/cursor/ai-ats-b2b-platform-4f1f/gina-express/frontend/patch-apply-command-actions.mjs \
  -o /tmp/patch-apply-command-actions.mjs
node /tmp/patch-apply-command-actions.mjs ~/lyday-gina-backend
```

Then build frontend, push Gina, set `SIGNALHIRE_BASE_URL` + `RELAY_SECRET`, redeploy,
**re-ask Gina** to queue Maria (do not reuse the bad action 80), then Check for actions.

## Kimberley's Note Panel

Team bot replies (Maria / Michelle / Kelley / Ashton) land in **Kimberley's Notes**
and also roll into Gina's morning **Pipeline Stage Counts** briefing.

```bash
curl -fsSL https://raw.githubusercontent.com/jlyday65/AI-ATS/cursor/ai-ats-b2b-platform-4f1f/gina-express/frontend/patch-kimberley-notes.mjs \
  -o /tmp/patch-kimberley-notes.mjs
curl -fsSL https://raw.githubusercontent.com/jlyday65/AI-ATS/cursor/ai-ats-b2b-platform-4f1f/gina-express/frontend/patch-pipeline-stage-counts.mjs \
  -o /tmp/patch-pipeline-stage-counts.mjs

# also need sibling files next to the patchers:
mkdir -p /tmp/gina-express-frontend /tmp/gina-express-lib /tmp/gina-express-agents /tmp/gina-express-routes /tmp/gina-express-briefing
# Prefer: clone/pull AI-ATS and run from the repo:
cd ~/AI-ATS
git pull origin cursor/ai-ats-b2b-platform-4f1f
node gina-express/frontend/patch-kimberley-notes.mjs ~/lyday-gina-backend/gina-backend
node gina-express/frontend/patch-pipeline-stage-counts.mjs ~/lyday-gina-backend/gina-backend
cd ~/lyday-gina-backend/gina-backend/frontend && npm run build
cd ~/lyday-gina-backend/gina-backend
git add -A && git commit -m "Kimberley Notes panel + Pipeline Stage Counts briefing" && git push
```

Where to read replies:
1. Gina ATS → **Kimberley's Notes** (panel)
2. Agent → **Check for actions** (summary line + note filed)
3. Morning briefing / **Send Pipeline Stage Counts to Gina** (includes team updates)

Optional Postgres table (file store works without it):

```sql
CREATE TABLE IF NOT EXISTS kimberley_notes (
  id SERIAL PRIMARY KEY,
  from_agent TEXT NOT NULL,
  agent_role TEXT,
  task TEXT NOT NULL,
  reply TEXT NOT NULL,
  action_id TEXT,
  requested_by TEXT DEFAULT 'Kimberley',
  status TEXT DEFAULT 'unread',
  include_in_briefing BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Install on Gina (Terminal)

```bash
curl -fsSL https://raw.githubusercontent.com/jlyday65/AI-ATS/cursor/ai-ats-b2b-platform-4f1f/gina-express/frontend/patch-gina-team-commands.mjs \
  -o /tmp/patch-gina-team-commands.mjs

# also fetch the agents package (patcher can download, or):
mkdir -p /tmp/gina-agents
curl -fsSL https://raw.githubusercontent.com/jlyday65/AI-ATS/cursor/ai-ats-b2b-platform-4f1f/gina-express/agents/registry.js \
  -o /tmp/gina-agents/registry.js
curl -fsSL https://raw.githubusercontent.com/jlyday65/AI-ATS/cursor/ai-ats-b2b-platform-4f1f/gina-express/agents/command-agent.tool.js \
  -o /tmp/gina-agents/command-agent.tool.js
curl -fsSL https://raw.githubusercontent.com/jlyday65/AI-ATS/cursor/ai-ats-b2b-platform-4f1f/gina-express/maria-source.tool.js \
  -o /tmp/maria-source.tool.js
curl -fsSL https://raw.githubusercontent.com/jlyday65/AI-ATS/cursor/ai-ats-b2b-platform-4f1f/gina-express/GINA_TEAM_PROMPT_RULE.txt \
  -o /tmp/GINA_TEAM_PROMPT_RULE.txt

node /tmp/patch-gina-team-commands.mjs ~/lyday-gina-backend
```

Then commit/push Gina (not `node_modules`), set Railway:

- `RELAY_SECRET` — shared with SignalHire  
- `SIGNALHIRE_BASE_URL` — SignalHire public URL (for Maria)

Redeploy Gina.

## Example asks (Kimberley → Gina)

```text
Ask Maria to source a Warehouse Mechanic in Atlanta, GA. All candidates must have a resume on file.
Have Michelle screen the Warehouse Mechanic candidates that just came in.
Tell Kelley to move Ava Chen to Phone Screen and note "Kimberley requested".
Get Ashton to draft a follow-up email to the Atlanta Mechanic shortlist.
```

Gina should queue `command_agent` for the named bot — not refuse.

## Files

| File | Purpose |
|------|---------|
| `agents/registry.js` | Canonical bot list + aliases |
| `agents/command-agent.tool.js` | `command_agent` tool / runner |
| `GINA_TEAM_PROMPT_RULE.txt` | Paste into Gina system prompt |
| `maria-source.tool.js` | Maria → SignalHire |
| `frontend/patch-gina-team-commands.mjs` | One-shot disk patcher |
| `MARIA.md` | Maria sourcing details |
