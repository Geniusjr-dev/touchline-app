# Touchline Milestone 1 rollout

This update changes the application and database together. Perform the rollout when no match is being scored live.

## 1. Apply the existing-project migration

1. Open the Touchline Supabase project.
2. Go to **SQL Editor** and create a new query.
3. Open `supabase/001_match_integrity.sql` from this package and paste the complete file into the query.
4. Run it once. Do not run `supabase/schema.sql` against the existing project.
5. Confirm that the query completes successfully before deploying the application files.

The migration is additive and preserves the current teams, competitions, matches, events, players and users. It places existing records in a default Touchline organization. Existing scorer accounts are assigned to existing matches; new matches can be assigned from the Matches admin screen.

Useful read-only checks after the migration:

```sql
select id, name, slug from public.organizations;

select p.email, p.role as profile_role, p.status,
       om.role as organization_role, o.name as organization
from public.profiles p
left join public.organization_members om on om.user_id = p.id
left join public.organizations o on o.id = om.organization_id
order by p.created_at;

select status, count(*) from public.matches group by status order by status;
```

At least one account must show `admin` under `organization_role`. If that is not your intended administrator, correct the membership in the Supabase Table Editor before continuing.

## 2. Copy the update into the real GitHub folder

The commands below assume the downloaded ZIP is in Downloads and the real repository is `$HOME\Desktop\touchline-real`.

```powershell
$Zip = "$HOME\Downloads\touchline-milestone-1.zip"
$Stage = "$HOME\Desktop\touchline-m1-update"
$Project = "$HOME\Desktop\touchline-real"

Expand-Archive -Path $Zip -DestinationPath $Stage -Force
Get-ChildItem -Path $Stage -Force |
  Where-Object { $_.Name -notin @(".env.local", ".git", "node_modules", ".next") } |
  Copy-Item -Destination $Project -Recurse -Force

Set-Location $Project
node -v
npm install
npm run lint
npm run build
git status
```

The Node version must be 20.9 or newer. Do not overwrite the existing `.env.local`, and never place a Supabase service-role key in the project.

## 3. Commit and deploy through Vercel

After both checks succeed:

```powershell
Set-Location "$HOME\Desktop\touchline-real"
git add .
git commit -m "Add secure live scoring and match integrity"
git push
```

Vercel will deploy from the connected `main` branch. The existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` variables remain valid; no new secret is required.

## 4. Production smoke test

Use a test fixture rather than an important completed match.

1. Sign in as an administrator and confirm Teams and Matches are visible.
2. Create or open a scheduled test match and assign a scorer account.
3. Sign in as the scorer and confirm only assigned matches are listed.
4. Kick off and verify the `m:ss` clock ticks every second.
5. Tap **GOAL**, confirm the score changes immediately, then choose the scorer or **Unknown scorer**.
6. Confirm the public home and match centre update without refreshing.
7. Select half time, resume the second half, and verify the clock pauses and resumes.
8. Select full time and verify event buttons and deletion are locked.
9. As an administrator, deliberately reopen the result, make one test correction, then lock full time again.
10. Confirm the Facts timeline shows the scorer, football minute and running score, and that Table appears before Stats.

## Included in this milestone

- Organization ownership and organization-scoped admin data
- Enforced admin/scorer roles and active/suspended accounts
- Per-match scorer assignment
- Atomic score/event recording with an immediate scorer prompt
- Second-based live clock with half-time, full-time and extra-time states
- Football-style event minutes, including stepped same-minute goals
- Full-time lock, deliberate admin reopening and audit records
- Realtime home and match-centre updates
- Real competition table calculations; unrecorded statistics no longer display fabricated values
- Empty H2H state and corrected Table/Stats tab order
- Next.js 16/React 19 security upgrade, linting and dependency audit

## Deferred to the next milestones

- Referee, stadium/park and other Preview fields
- Probable and confirmed match line-ups
- Scorer-entered match statistics
- Real H2H history
- Functional calendar/date filtering on the home screen
- Multi-organization onboarding and member-invitation screens
