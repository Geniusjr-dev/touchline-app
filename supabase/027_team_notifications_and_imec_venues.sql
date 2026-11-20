begin;

create table if not exists public.team_push_subscriptions (
  push_subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (push_subscription_id, team_id)
);

create index if not exists team_push_subscriptions_team_idx
  on public.team_push_subscriptions(team_id, push_subscription_id);

alter table public.team_push_subscriptions enable row level security;
revoke all on table public.team_push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.team_push_subscriptions to service_role;

update public.matches as match
set venue_name = 'Buya Community Park'
from public.tournament_editions as edition
where edition.id = match.edition_id
  and edition.competition_id = '013f3c6e-4aa1-486f-a0f9-1d031265655e'
  and match.competition_id = edition.competition_id
  and regexp_replace(edition.label, '[^0-9]', '', 'g') in ('2025', '20252026', '202526');

commit;
