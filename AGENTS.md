<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

- This is a single self-contained Next.js 16 app (package manager: **npm**, see `package-lock.json`). Standard scripts live in `package.json`: `npm run dev` (port 3000), `npm run build`, `npm start`, `npm run lint`, `npm test`.
- No database, Docker, or external infra is required. Data is an in-memory store seeded on boot (`src/lib/store.ts`), candidates are synthetically generated, and ranking is heuristic — no real LLM calls. The store resets on every server restart.
- No env vars are needed to run/build/test. The only real external dependency is the remote Gina ATS (`/api/ats/gina/test` and ATS push). Without `RELAY_SECRET` (+ optional `GINA_ATS_BASE_URL`/`GINA_ATS_APP_PASSWORD`/`GINA_ATS_API_KEY` in `.env.local`, template in `.env.example`), the app still runs fine; only live ATS connectivity/push degrades gracefully (e.g. sourcing shows "ATS sync failed / Missing GINA_RELAY_SECRET").
- Hello-world / core flow: POST `/api/sourcing` with `{"jobId":"job_senior_fullstack","limit":5}`, or click "Run AI sourcing agent" on `/sourcing`, to get ranked candidates.
- `npm test` uses Node's built-in test runner via `tsx --test src/**/*.test.ts` and runs fully offline.
