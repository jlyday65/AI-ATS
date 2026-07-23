# Gina Express `RELAY_SECRET` middleware

Production Gina (`lyday-gina-backend-production.up.railway.app`) is **Express**
(`x-powered-by: Express`). Chat bots that still work do not fix REST `/api/*`
for SignalHire — Gina must accept the shared secret on `/api`.

Next.js `middleware` / `proxy` in SignalHire cannot fix Gina’s 401s.

## Install in `lyday-gina-backend`

1. Copy `relay-auth.middleware.js` into the Gina Express repo (next to `server.js`
   / `index.js` / `app.js`).
2. Wire it **before** API routers:

```js
const { relayAuth } = require("./relay-auth.middleware");
// …
app.use("/api", relayAuth);
```

3. Commit + push the Gina repo.
4. Railway → **Gina** service → Variables → confirm `RELAY_SECRET` is set.
5. **Redeploy** Gina (variable changes do nothing until redeploy).
6. Smoke test:

```bash
# expect 401
curl -s https://lyday-gina-backend-production.up.railway.app/api/jobs

# expect 200 (or a non-auth error) with the real secret
curl -s https://lyday-gina-backend-production.up.railway.app/api/jobs \
  -H "X-Relay-Secret: $RELAY_SECRET"

curl -s https://lyday-gina-backend-production.up.railway.app/api/jobs \
  -H "Authorization: Bearer $RELAY_SECRET"
```

7. Paste the **same** `RELAY_SECRET` into SignalHire (`/ats` or `.env`).

## Behavior

| `RELAY_SECRET` | Request | Result |
| --- | --- | --- |
| unset | any `/api/*` | allowed (dev) |
| set | no/wrong secret | `401 {"error":"Not authenticated"}` |
| set | `X-Relay-Secret` match | next() |
| set | `Authorization: Bearer` match | next() |

## Test locally

```bash
node --test gina-express/relay-auth.middleware.test.js
```
