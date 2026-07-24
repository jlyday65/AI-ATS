# Wire RELAY_SECRET into Gina (Express ESM)

Your `server.js` shows:

- Global auth: `app.use(requireAppAuth)` from `authApp.js`
- ATS routes: `/ats` (not `/api/jobs`)
- Bots: `/maria`, `/michelle`, `/kelly`, `/ashton`
- Chat: `/chat`, Slack/Telegram/WhatsApp

Chat can work while SignalHire gets 401 because SignalHire calls REST with `RELAY_SECRET`, and `requireAppAuth` is rejecting it.

## Fix (required): replace `authApp.js`

SignalHire ats-v9 already sends `X-Relay-Secret`. If you still see:

```json
{"error":"Not authenticated"}
```

that response is from **`requireAppAuth` in authApp.js**, not from `requireRelaySecret` in auth.js.

Copy `gina-express/authApp.js` over Gina’s `authApp.js` (or `middleware/authApp.js`).

The critical line inside `requireAppAuth` is:

```js
if (hasValidRelaySecret(req)) return next();
```

It must run **before** `res.status(401).json({ error: "Not authenticated" })`.

Keep `auth.js` exporting `requireRelaySecret` separately (used by `/chat`, `/ats`, bots).

## Optional: `server.js` note

Do **not** only add Next.js `src/middleware.ts`.  
Do **not** expect `/api/jobs` — use `/ats/...`.

If you add standalone middleware, use ESM:

```js
import { relayAuth } from "./relay-auth.middleware.mjs";
// Only useful if it runs BEFORE requireAppAuth marks failure,
// or if requireAppAuth is taught to honor RELAY_SECRET (preferred).
```

## Redeploy

1. Push Gina
2. Railway → `RELAY_SECRET` set → Redeploy
3. SignalHire `/ats` → same secret → Test Gina  
   Diagnostics should probe `/ats`, `/ats/jobs`, `/maria`, etc.

## Maria sourcing bridge

See [MARIA.md](./MARIA.md) and `maria-source.tool.js`.

Maria (Gina) → `POST {SIGNALHIRE}/api/maria/source` with `X-Relay-Secret` →
SignalHire sources → pushes to Gina `/ats/import-candidates`.

## Resume intake

See [RESUMES.md](./RESUMES.md) and `attach-resume.snippet.js`.

SignalHire `/resumes` uploads PDF/text → extracts `resumeText` → Gina
`import_candidate` (optionally upsert by email).
