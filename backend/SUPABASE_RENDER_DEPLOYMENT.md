# Supabase + Render deployment

The backend is Node.js/Express. It now uses Supabase PostgreSQL when `DATABASE_URL` is set and keeps SQLite only as a local-development fallback.

## Render service settings

- Root Directory: `backend`
- Build Command: `npm ci`
- Start Command: `npm start`
- Health Check Path: `/api/ready`
- Node version: `22.22.0` (pinned in `.node-version`)

Do not run the data migration in the Render build command. Builds must be repeatable and should not copy local data on every deployment.

The native `sqlite3` npm package is intentionally not used. Production loads PostgreSQL only; local development and the one-time migration script use Node's built-in SQLite support, avoiding native GLIBC compatibility failures on Render.

## Required Render environment variables

```text
APP_MODE=production
FRONTEND_URL=https://YOUR-FRONTEND-DOMAIN
DATABASE_URL=postgresql://...
DATABASE_POOL_SIZE=5
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=...
```

Add the existing AI, LiveKit, mail, session, and report-signing settings from `backend/.env` as separate Render secrets. Do not include `PORT`; Render injects it. Replace localhost URLs with deployed service URLs.

Use the Supabase **Session pooler** connection string for `DATABASE_URL` when Render needs IPv4 connectivity. Copy it from Supabase Dashboard -> Connect, replace the password placeholder, and store the complete value only in Render. The API URL and publishable key alone do not provide a PostgreSQL connection.

`SUPABASE_SECRET_KEY` is not required by the current backend. The backend verifies user access tokens with the publishable key and performs SQL through `DATABASE_URL`, reducing the number of privileged credentials in the service.

Generate strong independent production values for these settings; never reuse the examples:

```text
JWT_SECRET=<random value of at least 32 bytes>
SESSION_SECRET=<different random value of at least 32 bytes>
REPORT_SIGNING_SECRET=<different random value of at least 32 bytes>
PUBLIC_REPORT_VERIFY_BASE_URL=https://YOUR-FRONTEND-DOMAIN/reports/verify
```

## Existing SQLite data

Keep a backup of `backend/data/voiceshield.db`. To copy it once into Supabase, set `DATABASE_URL` in the local shell and run:

```powershell
cd backend
npm ci
npm run migrate:postgres
```

The migration is idempotent: primary-key conflicts update the existing row. The backend also creates missing application tables and indexes at startup without dropping existing Supabase tables.

## Verification after deploy

1. Open `/api/ready`; it must return HTTP 200 and `database.engine` must be `postgres`.
2. Open `/api/system/providers`; `database.available` must be `true`.
3. Sign in, analyze one audio file, and confirm it appears only in that user's history.
4. Generate, approve, download, and verify an incident report.
5. Test with a second account to confirm it cannot read the first account's history or reports.

## Frontend deployment

The deployed Vite frontend must define:

```text
VITE_API_BASE_URL=https://YOUR-BACKEND.onrender.com
```

Do not append `/api`. WebSocket requests are derived from this URL automatically. Set the backend's `FRONTEND_URL` to the exact deployed frontend origin so credentialed CORS and authentication cookies work.

## Security requirement

Rotate every API key or password that has ever been pasted into chat, screenshots, logs, or committed files before deploying. Keep `backend/.env` local; it is already ignored by Git.
