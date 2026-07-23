# SignalHire — B2B AI ATS Platform

SignalHire is a B2B AI recruiting layer that sources candidates across **45+ platforms** (hireEZ-style coverage) and syncs ranked shortlists into your ATS — with a first-class connector for a **Claude-built custom ATS**.

## What you get

- **Multi-tenant B2B workspace** (org, seats, roles, plans)
- **50-platform catalog** spanning developer, healthcare, academic, design, job boards, and rediscovery
- **AI sourcing agent** that fans out across selected platforms and ranks fit
- **ATS integration hub** for Claude ATS, Greenhouse, Lever, Workday, iCIMS, Bullhorn, and webhooks
- **Dashboard UI** for jobs, platform coverage, connections, and sourcing runs

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm test
npm run build
```

## Gina ATS connection (production)

SignalHire is wired to the Lyday Talent Partners ATS (**Gina**) at:

`https://lyday-gina-backend-production.up.railway.app`

Bot integrations (including SignalHire) authenticate with **`RELAY_SECRET`**.

If the old secret stopped working:

1. Railway → Gina service → Variables → set a new `RELAY_SECRET`
2. Redeploy Gina
3. Update every bot + SignalHire to the same value

```bash
cp .env.example .env.local
# set RELAY_SECRET=<same value as Railway Gina>
```

Test connectivity:

```bash
curl -s http://localhost:3000/api/ats/gina/test | jq
```

## API authentication (RELAY_SECRET) — Express on Gina

SignalHire talks to Gina’s **Express** REST API. If SignalHire gets
`401 {"error":"Not authenticated"}` on Gina `/api/*` while chat bots still work,
Gina’s Express app is not accepting `RELAY_SECRET` on `/api`. A Next.js
`middleware` / `proxy` in this repo cannot fix that.

**Fix:** mount Express middleware on Gina `/api` that accepts either:

- `X-Relay-Secret: <RELAY_SECRET>`
- `Authorization: Bearer <RELAY_SECRET>`

compared to `process.env.RELAY_SECRET` (auth skipped when unset).

Ready-to-copy middleware + wiring instructions:

→ [`gina-express/`](./gina-express/) (`relay-auth.middleware.js`)

```bash
# After Gina redeploy — expect 401 without secret
curl -s https://lyday-gina-backend-production.up.railway.app/api/jobs

# Expect non-auth success with the shared secret
curl -s https://lyday-gina-backend-production.up.railway.app/api/jobs \
  -H "X-Relay-Secret: $RELAY_SECRET"
curl -s https://lyday-gina-backend-production.up.railway.app/api/jobs \
  -H "Authorization: Bearer $RELAY_SECRET"
```

### Redeploy Gina on Railway

1. Apply `gina-express/relay-auth.middleware.js` in **`lyday-gina-backend`**
   (`app.use("/api", relayAuth)` before API routers) → commit → push.
2. Railway → **Gina** service → Variables → set `RELAY_SECRET`.
3. **Redeploy** Gina (required after code or variable changes).
4. Set the same secret in SignalHire (`.env` / `/ats`) and every bot.

## Key API routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/org` | Demo B2B organization + members |
| GET/POST | `/api/jobs` | List/create requisitions |
| GET | `/api/platforms` | Platform catalog + coverage summary |
| GET/POST | `/api/ats` | List providers / save ATS connection |
| GET/POST | `/api/sourcing` | List runs / execute AI sourcing (+ optional ATS push) |
| GET | `/api/sync` | ATS sync event feed |

## Architecture

```
src/
  lib/
    platforms/   # 45+ platform catalog + search adapters
    ats/         # Claude ATS + marketplace providers
    ai/          # ranking / sourcing brief
    sourcing/    # end-to-end agent orchestration
    store.ts     # in-memory multi-tenant demo data
  app/
    api/         # REST surface for B2B product + integrations
    dashboard/   # org workspace
    platforms/   # coverage map
    ats/         # connection manager
    sourcing/    # AI console
```

## Next hardening steps

1. Persist orgs/jobs/candidates in Postgres
2. Add real OAuth/API connectors per platform
3. Swap heuristic ranking for hosted LLM scoring
4. Add SSO (SAML/OIDC) for enterprise B2B login
