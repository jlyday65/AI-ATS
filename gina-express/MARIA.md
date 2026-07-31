# Maria → SignalHire sourcing

Maria is Gina’s sourcer. She does **not** scrape platforms herself in this bridge —
she asks SignalHire to source, then SignalHire pushes named candidates into Gina.

## Fix: Maria refuses “source Warehouse Mechanic in Atlanta”

If Maria replies that she can only queue **create_candidate / update_stage / add_note**,
her Gina prompt/tool list is missing sourcing. Run the Terminal patcher (do not paste in chat):

```bash
curl -fsSL https://raw.githubusercontent.com/jlyday65/AI-ATS/cursor/ai-ats-b2b-platform-4f1f/gina-express/frontend/patch-maria-sourcing.mjs \
  -o /tmp/patch-maria-sourcing.mjs
curl -fsSL https://raw.githubusercontent.com/jlyday65/AI-ATS/cursor/ai-ats-b2b-platform-4f1f/gina-express/maria-source.tool.js \
  -o /tmp/maria-source.tool.js

node /tmp/patch-maria-sourcing.mjs ~/lyday-gina-backend
```

Then commit/push Gina, set Railway `SIGNALHIRE_BASE_URL` + `RELAY_SECRET`, redeploy.

Manual fallback: paste `MARIA_SOURCE_PROMPT_RULE.txt` into Maria’s system prompt and wire
`source_candidates_signalhire` from `maria-source.tool.js`. See also `queue-source-action.snippet.js`.

## Flow

```
Maria (Gina) — people
  → POST {SIGNALHIRE}/api/maria/source   (header: X-Relay-Secret)
  → Coresignal Employee / Bright Data people / demo fallback
  → POST Gina /ats/import-candidates
  → Gina Agent → Check for actions → import_candidate

Maria (Gina) — job market intel
  → POST {SIGNALHIRE}/api/maria/market   (header: X-Relay-Secret)
  → Coresignal Multi-source Jobs + Bright Data Jobs (demo if no keys)
  → insights: competing employers, title variants, salary samples
```

Jobs APIs are **not** people search. Use `/api/maria/market` for market research and
`/api/maria/source` for candidate shortlists. See `docs/DATA-PROVIDERS.md`.

## Gina setup

1. Copy `maria-source.tool.js` into Gina (e.g. next to `routes/maria.js`).
2. Wire Maria’s tool list to `mariaSourceTool` / `mariaSourceViaSignalHire`.
3. Paste `MARIA_SOURCE_PROMPT_RULE.txt` into Maria’s system prompt (or run the patcher).
4. Set Railway env:
   - `RELAY_SECRET` — same value as SignalHire `/ats`
   - `SIGNALHIRE_BASE_URL` — public URL of SignalHire (or tunnel for local)
5. Redeploy Gina.

## SignalHire setup

1. Open `/ats`, save Gina base URL + `RELAY_SECRET`.
2. Confirm with **Test Gina**.
3. Optional dry-run: open `/maria` → Ask Maria to source.
4. In Gina ATS → Agent → **Check for actions**.

## Local tunnel (ngrok) — keep it alive

Maria on Railway Gina calls your laptop via `SIGNALHIRE_BASE_URL`.
If ngrok shows **ERR_NGROK_3200 / endpoint is offline**, Check for actions will 404.

```bash
# Terminal A
cd ~/AI-ATS && npm run dev

# Terminal B
ngrok http 3000
```

Probe, then set Gina Railway `SIGNALHIRE_BASE_URL` to the https ngrok URL
(update it whenever ngrok issues a new subdomain):

```bash
node gina-express/frontend/diagnose-signalhire-base-url.mjs https://YOUR-SUBDOMAIN.ngrok-free.dev
```

## Auth notes

- Send **one** `X-Relay-Secret` header only (not also `x-relay-secret`).
- `Authorization: Bearer <secret>` is also accepted by SignalHire’s Maria route.
- `GET /api/maria/source` returns whether SignalHire has a relay secret configured (fingerprint only).

## Example curl (from Gina host / laptop)

People sourcing:

```bash
curl -sS -X POST "$SIGNALHIRE_BASE_URL/api/maria/source" \
  -H "Content-Type: application/json" \
  -H "X-Relay-Secret: $RELAY_SECRET" \
  -d '{
    "roleTitle": "Senior Full-Stack Engineer",
    "requiredSkills": ["TypeScript", "React"],
    "pushToGina": true,
    "pushTopN": 5
  }'
```

Job market intel:

```bash
curl -sS -X POST "$SIGNALHIRE_BASE_URL/api/maria/market" \
  -H "Content-Type: application/json" \
  -H "X-Relay-Secret: $RELAY_SECRET" \
  -d '{
    "roleTitle": "Operations Manager",
    "location": "Atlanta, GA",
    "keywords": ["warehouse", "logistics"],
    "limit": 12
  }'
```

Gina tool drop-in for market: `maria-market.tool.js` (`research_job_market_signalhire`).

## Save / Export + Maria reuse

After Michelle finishes screening, use ATS **Save / Export** (or `/job-save`) to
download Board + Candidate File as one `.txt` (save to your external drive).

That export also posts people to AI-ATS `POST /api/talent-pool/archive`. The next
time Maria sources a **similar** role, matching archived resumes are merged into
her shortlist automatically.

See `gina-express/JOB-SAVE-EXPORT.md`.
