# Keep SignalHire always on (no ngrok, no constant sign-in)

## Two separate things

| What | Needs browser login? | Needs AI-ATS process online? |
|---|---|---|
| Gina → **Check for actions** (Maria source / Michelle / notes) | **No** | **Yes** (`SIGNALHIRE_BASE_URL`) |
| Opening SignalHire UI (`/ats`, `/maria`, …) | Only if live password gate is on | Yes if you use the UI |

Your error:

`SignalHire ngrok tunnel is OFFLINE (https://….ngrok-free.dev/api/maria/source)`

means Gina could not reach AI-ATS. That is **not** a SignHire sign-in problem — the Mac tunnel was down.

## 1) Stop re-entering the SignalHire password

On SignalHire → **/ats**:

1. ATS mode: **Test** or **Live** (your choice for tags)
2. Live password re-entry: **Never (no password gate)**
3. **Save ATS mode**

Or in `.env.local` / Vercel env:

```bash
SIGNALHIRE_DISABLE_LIVE_PASSWORD=1
```

Maria / Check for actions already authenticate with `RELAY_SECRET` only (`/api/maria` is public to that secret).

## 2) Stop depending on Mac + ngrok (required for seamless Check for actions)

Deploy this repo (AI-ATS) once to a permanent host, then point Gina at it **once**.

### Deploy to Vercel

```bash
cd ~/AI-ATS
git pull origin cursor/ai-ats-b2b-platform-4f1f
npx vercel --prod
```

Set these env vars on the Vercel project (same values as local `.env.local`):

- `RELAY_SECRET` — **must match** Gina Railway
- `CORESIGNAL_API_KEY` / `PEOPLEDATALABS_API_KEY` (as needed)
- `GINA_ATS_BASE_URL=https://lyday-gina-backend-production.up.railway.app`
- `SIGNALHIRE_DISABLE_LIVE_PASSWORD=1`
- `ATS_MODE=live` (optional)

Probe:

```bash
node gina-express/frontend/diagnose-signalhire-base-url.mjs https://YOUR-AI-ATS.vercel.app
```

Expect JSON with `"agent":"maria"`.

### Point Gina Railway (once)

- `SIGNALHIRE_BASE_URL=https://YOUR-AI-ATS.vercel.app` (no trailing slash, **not** ngrok)
- `RELAY_SECRET` = same as Vercel

Redeploy Gina. Leave Mac `npm run dev` / ngrok **off** — not needed anymore.

## 3) Daily workflow (seamless)

1. In Gina chat, queue work for Maria / Michelle / Kelley (as today).
2. Click **Agent → Check for actions**.
3. Board / Kimberley Notes update. Nothing runs until you click.

No SignHire browser login. No ngrok. No “tunnel offline” when your laptop sleeps.
