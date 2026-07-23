# Wire RELAY_SECRET into Gina (Express ESM)

Your `server.js` shows:

- Global auth: `app.use(requireAppAuth)` from `authApp.js`
- ATS routes: `/ats` (not `/api/jobs`)
- Bots: `/maria`, `/michelle`, `/kelly`, `/ashton`
- Chat: `/chat`, Slack/Telegram/WhatsApp

Chat can work while SignalHire gets 401 because SignalHire calls REST with `RELAY_SECRET`, and `requireAppAuth` is rejecting it.

## Fix (best): update `authApp.js`

Inside `requireAppAuth`, before returning 401, allow relay secret:

```js
import crypto from "crypto";

function hasValidRelaySecret(req) {
  const secret = process.env.RELAY_SECRET;
  if (!secret) return false;
  const headerSecret = req.get("x-relay-secret") || "";
  const bearer = (req.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const provided = headerSecret || bearer;
  if (!provided || provided.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
}

// inside requireAppAuth:
if (hasValidRelaySecret(req)) return next();
```

Keep existing cookie / app-password logic for the UI.

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
