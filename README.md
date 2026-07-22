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

## API authentication (RELAY_SECRET)

Every `/api/*` route on SignalHire is protected by the same shared **`RELAY_SECRET`**
so only trusted bots and integrations can reach it. Callers must send the secret
as **either** header:

```bash
# X-Relay-Secret header
curl -s http://localhost:3000/api/org -H "X-Relay-Secret: $RELAY_SECRET"

# ...or Authorization: Bearer
curl -s http://localhost:3000/api/org -H "Authorization: Bearer $RELAY_SECRET"
```

The value is compared against `process.env.RELAY_SECRET`. Requests with a missing
or wrong secret get `401 Unauthorized`.

- **No `RELAY_SECRET` set → auth is disabled.** This keeps local development and
  the built-in dashboard/sourcing UI working without a secret. Set the variable
  only when you want to lock the API down.
- Use the **same** `RELAY_SECRET` value across Gina, SignalHire, and every bot.

### Enable it locally

```bash
cp .env.example .env.local
# set RELAY_SECRET=<same value as Railway Gina>
npm run dev   # restart so the new env var is picked up
```

### Deploy on Railway

1. Railway → SignalHire service → **Variables** → add `RELAY_SECRET=<value>`
   (use the same value configured on the Gina service and every bot).
2. **Redeploy** the SignalHire service so the middleware reads the new variable —
   changing the variable without a redeploy will not take effect.
3. Confirm it is live: a request **without** the secret should now return `401`,
   and one **with** `X-Relay-Secret` / `Authorization: Bearer` should return `200`.

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
