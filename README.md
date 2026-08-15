# Touchline

Touchline is a general grassroots-football live-score platform with public fixtures, realtime match centres, competition tables and a protected admin/scorer workspace.

## Stack

- Next.js 16 App Router and React 19
- Tailwind CSS
- Supabase Postgres, Auth and Realtime
- Vercel deployment

Node.js 20.9 or newer is required.

## Local development

```bash
npm install
npm run dev
```

The app uses built-in sample data when Supabase is not configured. Copy `.env.local.example` to `.env.local` and add only the public project URL and anon key to use the database.

## Supabase setup

- Brand-new project: run `supabase/schema.sql` once.
- Existing Touchline project: do **not** rerun `schema.sql`. Run `supabase/001_match_integrity.sql` once.

The migration backfills current data into a default organization, secures roles, creates scorer assignments, adds the second-based clock and installs atomic scoring functions.

## Quality checks

```bash
npm run lint
npm run build
npm audit --omit=dev
```

## Main routes

- `/`: public fixtures and live scores
- `/match/[id]`: public match centre
- `/admin`: protected dashboard
- `/admin/teams`: admin-only team and squad management
- `/admin/matches`: admin fixture/scorer management or a scorer's assigned matches

See `DEPLOYMENT_MILESTONE_1.md` before applying this update to the existing Vercel deployment.
