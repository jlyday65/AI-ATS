# Maria → SignalHire sourcing

Maria is Gina’s sourcer. She does **not** scrape platforms herself in this bridge —
she asks SignalHire to source, then SignalHire pushes named candidates into Gina.

## Flow

```
Maria (Gina) 
  → POST {SIGNALHIRE}/api/maria/source   (header: X-Relay-Secret)
  → SignalHire multi-platform demo search
  → POST Gina /ats/import-candidates
  → Gina Agent → Check for actions → import_candidate
```

## Gina setup

1. Copy `maria-source.tool.js` into Gina (e.g. next to `routes/maria.js`).
2. Wire Maria’s tool list to `mariaSourceTool` / `mariaSourceViaSignalHire`.
3. Set Railway env:
   - `RELAY_SECRET` — same value as SignalHire `/ats`
   - `SIGNALHIRE_BASE_URL` — public URL of SignalHire (or tunnel for local)
4. Redeploy Gina.

## SignalHire setup

1. Open `/ats`, save Gina base URL + `RELAY_SECRET`.
2. Confirm with **Test Gina**.
3. Optional dry-run: open `/maria` → Ask Maria to source.
4. In Gina ATS → Agent → **Check for actions**.

## Auth notes

- Send **one** `X-Relay-Secret` header only (not also `x-relay-secret`).
- `Authorization: Bearer <secret>` is also accepted by SignalHire’s Maria route.
- `GET /api/maria/source` returns whether SignalHire has a relay secret configured (fingerprint only).

## Example curl (from Gina host / laptop)

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
