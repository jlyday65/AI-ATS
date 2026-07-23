# Gina Express RELAY_SECRET middleware

Production Gina on Railway is **Express** (`x-powered-by: Express`).  
Next.js `src/middleware.ts` will **not** run there.

## Install into Gina

1. Copy `relay-auth.middleware.js` into your Gina backend repo (same folder as `server.js` / `index.js`, or adjust the require path).
2. In Gina’s main server file, **before** API routes:

```js
const { relayAuth } = require("./relay-auth.middleware");
app.use("/api", relayAuth);
```

3. Commit + push Gina.
4. Railway → Gina service → Variables → set `RELAY_SECRET` → **Redeploy**.
5. SignalHire `/ats` → paste the same secret → **Test Gina**.

## Headers SignalHire sends

- `X-Relay-Secret: <secret>`
- `Authorization: Bearer <secret>`
