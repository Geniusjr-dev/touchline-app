# Touchline

Grassroots football live scores + admin scorer. Next.js (App Router) + Tailwind + Supabase.

## Local dev
    npm install
    npm run dev            # http://localhost:3000

Runs on built-in sample data until Supabase is configured.

## Connect Supabase (makes it real)
1. Create a project at supabase.com.
2. In the SQL Editor, paste and run `supabase/schema.sql`.
3. Project Settings → API: copy the Project URL and the anon public key.
4. Create `.env.local` from `.env.local.example` and paste both values.
5. Create your first user: Authentication → Users → Add user (email + password).
   Optionally set their role to `admin` in the `profiles` table.
6. Restart `npm run dev`.

On Vercel, add the same two env vars in Project → Settings → Environment Variables.

## Using it
- Public site: `/`  (matches home → tap a match → match centre)
- Admin: `/admin`  (sign in, then Teams and Matches; open a match to score it live)

Scores and events entered in the scorer appear on the public match page in realtime.
