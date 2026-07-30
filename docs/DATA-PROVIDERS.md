# Data providers — jobs market + people sourcing

SignalHire / Maria uses **two tracks**:

| Track | Purpose | Providers | Endpoint |
| --- | --- | --- | --- |
| **Job market intel** | Competing postings, employers, salary/title variants | Coresignal Multi-source Jobs + Bright Data LinkedIn Jobs | `POST /api/maria/market` |
| **Candidate sourcing** | People / resumes for shortlists | Coresignal Multi-source Employee (+ optional Bright Data LinkedIn profile enrichment) with demo fallback | `POST /api/maria/source` |

Jobs APIs alone do **not** return candidates. Use market for research; use source for people.

## Environment (AI-ATS `.env.local`)

```bash
# Jobs + people (Coresignal)
CORESIGNAL_API_KEY=

# Jobs (Bright Data Scrapers) + optional people URL enrichment
BRIGHTDATA_API_KEY=
BRIGHTDATA_JOBS_DATASET_ID=gd_lpfll7v5hcqtkxl6l
# Optional: comma-separated LinkedIn /in/ URLs to enrich during sourcing
BRIGHTDATA_PEOPLE_SEED_URLS=
BRIGHTDATA_PEOPLE_DATASET_ID=gd_l1viktl72bvl7bjuj0
BRIGHTDATA_JOBS_TIMEOUT_MS=45000

# Force demo people even if keys exist (tests)
PEOPLE_SOURCING_FORCE_DEMO=
```

Without keys, both tracks return **deterministic demo** data so Gina → Maria → Check for actions still works end-to-end.

## Auth

Same relay as Maria source: `X-Relay-Secret` matching Gina `RELAY_SECRET` / SignalHire `/ats`.

## Gina kit

- People: `gina-express/maria-source.tool.js` → `/api/maria/source`
- Market: `gina-express/maria-market.tool.js` → `/api/maria/market`

## Docs

- [Coresignal Multi-source Jobs](https://docs.coresignal.com/jobs-api/multi-source-jobs-api)
- [Coresignal Multi-source Employee](https://docs.coresignal.com/employee-api/multi-source-employee-api)
- [Bright Data LinkedIn Jobs discover-by-keyword](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-jobs-discover-by-keyword)
