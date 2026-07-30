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

## Key API routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/org` | Demo B2B organization + members |
| GET/POST | `/api/jobs` | List/create requisitions |
| GET | `/api/platforms` | Platform catalog + coverage summary |
| GET/POST | `/api/ats` | List providers / save ATS connection |
| GET/POST | `/api/sourcing` | List runs / execute AI sourcing (+ optional ATS push) |
| GET/POST | `/api/maria/source` | Maria people sourcing (+ Gina push); relay auth |
| GET/POST | `/api/maria/market` | Maria job-market intel (Coresignal + Bright Data Jobs) |
| GET | `/api/sync` | ATS sync event feed |

## Data providers (jobs + people)

Two tracks — see [docs/DATA-PROVIDERS.md](docs/DATA-PROVIDERS.md):

1. **Job market intel** — Coresignal Multi-source Jobs + Bright Data Jobs → `POST /api/maria/market`
2. **Candidate sourcing** — Coresignal Multi-source Employee (+ optional Bright Data LinkedIn URL enrichment), demo fallback → `POST /api/maria/source`

Set `CORESIGNAL_API_KEY` / `BRIGHTDATA_API_KEY` in `.env.local`. Without keys, both tracks use deterministic demo data.

## Architecture

```
src/
  lib/
    platforms/        # 45+ platform catalog + demo search
    people-sourcing/  # Coresignal Employee + Bright Data people
    jobs-market/      # Coresignal + Bright Data Jobs APIs
    ats/              # Claude ATS + marketplace providers
    ai/               # ranking / sourcing brief
    sourcing/         # end-to-end agent orchestration
    maria/            # Maria source + market entrypoints
    store.ts          # in-memory multi-tenant demo data
  app/
    api/              # REST surface for B2B product + integrations
    dashboard/        # org workspace
    platforms/        # coverage map
    ats/              # connection manager
    sourcing/         # AI console
```

## Next hardening steps

1. Persist orgs/jobs/candidates in Postgres
2. Expand live people discovery (Bright Data keyword discover) beyond URL enrichment
3. Swap heuristic ranking for hosted LLM scoring
4. Add SSO (SAML/OIDC) for enterprise B2B login
