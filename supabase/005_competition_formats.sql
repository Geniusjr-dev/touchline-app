-- Touchline competition formats: friendly, league and grouped tournament.
-- Run once after 004_team_display_names.sql.

begin;

-- Included here as an idempotent safeguard so this migration also works when
-- the preceding display-name migration has not yet been applied.
alter table public.teams add column if not exists display_name text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'teams_display_name_length_check'
      and conrelid = 'public.teams'::regclass
  ) then
    alter table public.teams add constraint teams_display_name_length_check
      check (display_name is null or char_length(trim(display_name)) between 1 and 40);
  end if;
end $$;

alter table public.competitions add column if not exists competition_type text not null default 'tournament';
alter table public.competitions add column if not exists group_count smallint not null default 0;
alter table public.competitions add column if not exists teams_per_group smallint not null default 0;

-- Preserve known friendlies and identify obvious existing leagues without
-- incorrectly converting cup/championship tournaments.
update public.competitions
set competition_type = 'friendly'
where name ~* 'friend(ly|lies)|exhibition|warm[ -]?up';

update public.competitions
set competition_type = 'league'
where competition_type = 'tournament'
  and name ~* 'league|premier division|first division|second division|serie [a-d]|liga';

alter table public.competitions drop constraint if exists competitions_type_check;
alter table public.competitions
  add constraint competitions_type_check
  check (competition_type in ('friendly', 'league', 'tournament'));

update public.competitions
set group_count = case when competition_type = 'tournament' then greatest(group_count, 1) else 0 end,
    teams_per_group = case when competition_type = 'tournament' then greatest(teams_per_group, 4) else 0 end;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'competitions_group_settings_check') then
    alter table public.competitions
      add constraint competitions_group_settings_check
      check (
        (competition_type = 'tournament' and group_count between 1 and 26 and teams_per_group between 2 and 32)
        or
        (competition_type in ('friendly', 'league') and group_count = 0 and teams_per_group = 0)
      );
  end if;
end $$;

alter table public.matches add column if not exists group_number smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'matches_group_number_check') then
    alter table public.matches
      add constraint matches_group_number_check
      check (group_number is null or group_number between 1 and 26);
  end if;
end $$;

create table if not exists public.competition_teams (
  competition_id uuid not null references public.competitions(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  group_number smallint,
  created_at timestamptz not null default now(),
  primary key (competition_id, team_id),
  constraint competition_teams_group_number_check
    check (group_number is null or group_number between 1 and 26)
);

create index if not exists competition_teams_group_idx
  on public.competition_teams(competition_id, group_number, team_id);
create index if not exists matches_competition_group_idx
  on public.matches(competition_id, group_number, created_at);

-- Existing tournament fixtures begin in Group A. Admins can redistribute the
-- teams afterwards without recreating any team, competition or match.
update public.matches m
set group_number = 1
from public.competitions c
where m.competition_id = c.id
  and c.competition_type = 'tournament'
  and m.group_number is null;

insert into public.competition_teams (competition_id, team_id, group_number)
select distinct m.competition_id, team_id,
       case when c.competition_type = 'tournament' then coalesce(m.group_number, 1) else null end
from public.matches m
join public.competitions c on c.id = m.competition_id
cross join lateral (values (m.home_id), (m.away_id)) as participants(team_id)
where m.competition_id is not null and participants.team_id is not null
on conflict (competition_id, team_id) do update
set group_number = excluded.group_number;

alter table public.competition_teams enable row level security;

drop policy if exists "public read competition teams" on public.competition_teams;
drop policy if exists "organization admins create competition teams" on public.competition_teams;
drop policy if exists "organization admins update competition teams" on public.competition_teams;
drop policy if exists "organization admins delete competition teams" on public.competition_teams;

create policy "public read competition teams" on public.competition_teams
  for select using (true);
create policy "organization admins create competition teams" on public.competition_teams
  for insert with check (
    exists (
      select 1 from public.competitions c
      join public.teams t on t.id = team_id and t.organization_id = c.organization_id
      where c.id = competition_id and public.is_org_admin(c.organization_id)
    )
  );
create policy "organization admins update competition teams" on public.competition_teams
  for update using (
    exists (select 1 from public.competitions c where c.id = competition_id and public.is_org_admin(c.organization_id))
  ) with check (
    exists (
      select 1 from public.competitions c
      join public.teams t on t.id = team_id and t.organization_id = c.organization_id
      where c.id = competition_id and public.is_org_admin(c.organization_id)
    )
  );
create policy "organization admins delete competition teams" on public.competition_teams
  for delete using (
    exists (select 1 from public.competitions c where c.id = competition_id and public.is_org_admin(c.organization_id))
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'teams'
  ) then
    alter publication supabase_realtime add table public.teams;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'competition_teams'
  ) then
    alter publication supabase_realtime add table public.competition_teams;
  end if;
end $$;

commit;
