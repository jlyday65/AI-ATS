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

```bash
cp .env.example .env.local
# set GINA_ATS_APP_PASSWORD to the Gina sign-in gate password
```

Test connectivity:

```bash
curl -s http://localhost:3000/api/ats/gina/test | jq
```

Gina auth flow used by the connector:

1. `POST /auth/app-login` with the app password (session cookie)
2. Authenticated calls to `/api/jobs`, `/api/candidates`, `/api/candidates/import`, etc.

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
