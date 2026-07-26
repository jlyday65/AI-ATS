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
patch the **chat system prompt / tool schema** (not only App.jsx):

```bash
curl -fsSL https://raw.githubusercontent.com/jlyday65/AI-ATS/cursor/ai-ats-b2b-platform-4f1f/gina-express/frontend/patch-gina-chat-tools.mjs \
  -o /tmp/patch-gina-chat-tools.mjs
node /tmp/patch-gina-chat-tools.mjs ~/lyday-gina-backend
```

Commit/push/redeploy Gina, then start a **new** chat and re-ask. Old threads often keep the old refusal.

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
