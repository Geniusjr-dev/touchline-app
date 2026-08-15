-- Touchline Milestone 1: match integrity, organizations, roles and safe live scoring.
-- Run once in Supabase -> SQL Editor before deploying the matching application code.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Identity and organization ownership
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists status text not null default 'active';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_role_check') then
    alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'scorer'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_status_check') then
    alter table public.profiles add constraint profiles_status_check check (status in ('active', 'suspended'));
  end if;
end $$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'scorer' check (role in ('admin', 'scorer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

alter table public.competitions add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.competitions add column if not exists match_duration_minutes smallint not null default 90;
alter table public.competitions add column if not exists extra_time_minutes smallint not null default 30;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'competitions_match_duration_check') then
    alter table public.competitions add constraint competitions_match_duration_check check (match_duration_minutes between 20 and 180);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'competitions_extra_time_check') then
    alter table public.competitions add constraint competitions_extra_time_check check (extra_time_minutes between 0 and 60);
  end if;
end $$;

alter table public.teams add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.matches add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.matches add column if not exists clock_elapsed_seconds integer not null default 0;
alter table public.matches add column if not exists current_period smallint not null default 0;
alter table public.matches add column if not exists home_score integer not null default 0;
alter table public.matches add column if not exists away_score integer not null default 0;
alter table public.matches add column if not exists locked_at timestamptz;
alter table public.matches add column if not exists reopened_at timestamptz;
alter table public.matches add column if not exists reopened_by uuid references public.profiles(id) on delete set null;
alter table public.matches add column if not exists reopen_reason text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'matches_status_check') then
    alter table public.matches add constraint matches_status_check check (status in ('scheduled', 'live', 'ht', 'et_live', 'et_ht', 'ft'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'matches_scores_check') then
    alter table public.matches add constraint matches_scores_check check (home_score >= 0 and away_score >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'matches_elapsed_check') then
    alter table public.matches add constraint matches_elapsed_check check (clock_elapsed_seconds >= 0);
  end if;
end $$;

alter table public.events add column if not exists display_minute integer;
alter table public.events add column if not exists elapsed_seconds integer;
alter table public.events add column if not exists period smallint;
alter table public.events add column if not exists player_id uuid references public.players(id) on delete set null;
alter table public.events add column if not exists recorded_by uuid references public.profiles(id) on delete set null;
alter table public.events add column if not exists home_score_after integer;
alter table public.events add column if not exists away_score_after integer;

create table if not exists public.match_scorers (
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

create table if not exists public.audit_logs (
  id bigint generated by default as identity primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  match_id uuid references public.matches(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists competitions_organization_idx on public.competitions(organization_id);
create index if not exists teams_organization_idx on public.teams(organization_id);
create index if not exists matches_organization_idx on public.matches(organization_id);
create index if not exists matches_competition_idx on public.matches(competition_id);
create index if not exists events_match_elapsed_idx on public.events(match_id, elapsed_seconds, created_at);
create index if not exists match_scorers_user_idx on public.match_scorers(user_id, match_id);

-- Bootstrap existing installations into one organization without losing data.
do $$
declare
  v_owner uuid;
  v_org uuid;
begin
  select id into v_owner
  from public.profiles
  order by (role = 'admin') desc, created_at asc
  limit 1;

  if v_owner is not null then
    select id into v_org from public.organizations order by created_at asc limit 1;
    if v_org is null then
      insert into public.organizations (name, slug, created_by)
      values ('Touchline', 'touchline', v_owner)
      returning id into v_org;
    end if;

    update public.profiles set role = 'admin' where id = v_owner;

    insert into public.organization_members (organization_id, user_id, role)
    select v_org, p.id, case when p.id = v_owner or p.role = 'admin' then 'admin' else 'scorer' end
    from public.profiles p
    on conflict (organization_id, user_id) do nothing;

    update public.competitions set organization_id = v_org where organization_id is null;
    update public.teams set organization_id = v_org where organization_id is null;
    update public.matches m
       set organization_id = coalesce(
         (select c.organization_id from public.competitions c where c.id = m.competition_id),
         (select t.organization_id from public.teams t where t.id = m.home_id),
         v_org
       )
     where m.organization_id is null;

    insert into public.match_scorers (match_id, user_id, assigned_by)
    select m.id, om.user_id, v_owner
    from public.matches m
    join public.organization_members om on om.organization_id = m.organization_id
    where om.role = 'scorer' and om.active
    on conflict (match_id, user_id) do nothing;
  end if;
end $$;

-- Convert the old minute clock and existing events to the new second clock.
update public.matches
set clock_elapsed_seconds = greatest(clock_elapsed_seconds, coalesce(clock_base, 0) * 60);

update public.events
set display_minute = greatest(1, coalesce(display_minute, minute, 1)),
    elapsed_seconds = greatest(0, coalesce(elapsed_seconds, minute * 60, 0)),
    period = coalesce(period, case when coalesce(minute, 0) > 45 then 2 else 1 end)
where display_minute is null or elapsed_seconds is null or period is null;

update public.matches m
set home_score = (select count(*)::int from public.events e where e.match_id = m.id and e.type = 'goal' and e.side = 'home'),
    away_score = (select count(*)::int from public.events e where e.match_id = m.id and e.type = 'goal' and e.side = 'away'),
    locked_at = case when m.status = 'ft' then coalesce(m.locked_at, now()) else m.locked_at end;

with running as (
  select e.id,
         sum(case when e.type = 'goal' and e.side = 'home' then 1 else 0 end)
           over (partition by e.match_id order by coalesce(e.elapsed_seconds, 0), e.created_at, e.id) as hs,
         sum(case when e.type = 'goal' and e.side = 'away' then 1 else 0 end)
           over (partition by e.match_id order by coalesce(e.elapsed_seconds, 0), e.created_at, e.id) as aws
  from public.events e
)
update public.events e
set home_score_after = running.hs,
    away_score_after = running.aws
from running
where e.id = running.id;

-- ---------------------------------------------------------------------------
-- Authorization helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active'
  );
$$;

create or replace function public.is_org_admin(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user() and exists (
    select 1 from public.organization_members om
    where om.organization_id = p_organization_id
      and om.user_id = auth.uid()
      and om.role = 'admin'
      and om.active
  );
$$;

create or replace function public.is_any_org_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user() and exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid() and om.role = 'admin' and om.active
  );
$$;

create or replace function public.can_score_match(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user() and exists (
    select 1
    from public.matches m
    where m.id = p_match_id
      and (
        public.is_org_admin(m.organization_id)
        or exists (
          select 1 from public.match_scorers ms
          where ms.match_id = m.id and ms.user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.can_view_profile(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id = auth.uid() or (
    public.is_active_user() and exists (
      select 1
      from public.organization_members target
      join public.organization_members viewer
        on viewer.organization_id = target.organization_id
      where target.user_id = p_user_id
        and target.active
        and viewer.user_id = auth.uid()
        and viewer.role = 'admin'
        and viewer.active
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Atomic match operations
-- ---------------------------------------------------------------------------

create or replace function public.transition_match_status(p_match_id uuid, p_status text)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_elapsed integer;
begin
  if not public.can_score_match(p_match_id) then
    raise exception 'You are not assigned to score this match';
  end if;

  select * into v_match from public.matches where id = p_match_id for update;
  if not found then raise exception 'Match not found'; end if;
  if p_status not in ('scheduled', 'live', 'ht', 'et_live', 'et_ht', 'ft') then
    raise exception 'Unsupported match status';
  end if;
  if p_status = v_match.status and p_status in ('live', 'et_live') then
    return v_match;
  end if;
  if v_match.status = 'scheduled' and p_status = 'ft' then
    raise exception 'A scheduled match cannot be moved directly to full time';
  end if;

  v_elapsed := coalesce(v_match.clock_elapsed_seconds, 0);
  if v_match.clock_started_at is not null then
    v_elapsed := v_elapsed + greatest(0, floor(extract(epoch from (clock_timestamp() - v_match.clock_started_at)))::int);
  end if;

  if p_status = 'scheduled' then
    if not public.is_org_admin(v_match.organization_id) then
      raise exception 'Only an administrator can reset a match';
    end if;
    if exists (select 1 from public.events where match_id = p_match_id) then
      raise exception 'A match with events cannot be reset';
    end if;
    update public.matches
      set status = 'scheduled', clock_elapsed_seconds = 0, clock_started_at = null,
          current_period = 0, locked_at = null, reopened_at = null,
          reopened_by = null, reopen_reason = null
      where id = p_match_id returning * into v_match;
  elsif p_status = 'live' then
    if v_match.status not in ('scheduled', 'ht', 'live') then
      raise exception 'This match cannot enter regular live play from its current state';
    end if;
    update public.matches
      set status = 'live',
          current_period = case when v_match.status = 'scheduled' then 1 when v_match.status = 'ht' then 2 else greatest(v_match.current_period, 1) end,
          clock_elapsed_seconds = case when v_match.status = 'scheduled' then 0 else v_elapsed end,
          clock_started_at = case when v_match.status = 'live' and v_match.clock_started_at is not null then v_match.clock_started_at else clock_timestamp() end,
          locked_at = null
      where id = p_match_id returning * into v_match;
  elsif p_status = 'ht' then
    if v_match.status <> 'live' then raise exception 'Only a live match can enter half time'; end if;
    update public.matches
      set status = 'ht', clock_elapsed_seconds = v_elapsed, clock_started_at = null
      where id = p_match_id returning * into v_match;
  elsif p_status = 'et_live' then
    if v_match.status not in ('ft', 'et_ht', 'et_live') then
      raise exception 'Extra time can only start after full time or resume after its break';
    end if;
    update public.matches
      set status = 'et_live',
          current_period = case when v_match.status = 'ft' then 3 when v_match.status = 'et_ht' then 4 else greatest(v_match.current_period, 3) end,
          clock_elapsed_seconds = v_elapsed,
          clock_started_at = case when v_match.status = 'et_live' and v_match.clock_started_at is not null then v_match.clock_started_at else clock_timestamp() end,
          locked_at = null
      where id = p_match_id returning * into v_match;
  elsif p_status = 'et_ht' then
    if v_match.status <> 'et_live' then raise exception 'Only a live extra-time period can be paused'; end if;
    update public.matches
      set status = 'et_ht', clock_elapsed_seconds = v_elapsed, clock_started_at = null
      where id = p_match_id returning * into v_match;
  else
    update public.matches
      set status = 'ft', clock_elapsed_seconds = v_elapsed, clock_started_at = null,
          locked_at = clock_timestamp()
      where id = p_match_id returning * into v_match;
  end if;

  insert into public.audit_logs (organization_id, match_id, actor_id, action, details)
  values (v_match.organization_id, p_match_id, auth.uid(), 'match.status', jsonb_build_object('status', p_status));
  return v_match;
end;
$$;

create or replace function public.reopen_match(p_match_id uuid, p_reason text)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then raise exception 'Match not found'; end if;
  if not public.is_org_admin(v_match.organization_id) then
    raise exception 'Only an administrator can reopen a match';
  end if;
  if v_match.status <> 'ft' or v_match.locked_at is null then
    raise exception 'Only a locked full-time match can be reopened';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Give a short reason for reopening the match';
  end if;

  update public.matches
  set locked_at = null, reopened_at = clock_timestamp(), reopened_by = auth.uid(), reopen_reason = trim(p_reason)
  where id = p_match_id returning * into v_match;

  insert into public.audit_logs (organization_id, match_id, actor_id, action, details)
  values (v_match.organization_id, p_match_id, auth.uid(), 'match.reopened', jsonb_build_object('reason', trim(p_reason)));
  return v_match;
end;
$$;

create or replace function public.record_match_event(
  p_match_id uuid,
  p_type text,
  p_side text,
  p_player_id uuid default null,
  p_player text default null,
  p_assist text default null
)
returns public.events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_event public.events%rowtype;
  v_elapsed integer;
  v_minute integer;
  v_player_name text;
  v_home integer;
  v_away integer;
  v_expected_team uuid;
begin
  if not public.can_score_match(p_match_id) then
    raise exception 'You are not assigned to score this match';
  end if;
  if p_type not in ('goal', 'yellow', 'red', 'sub', 'miss') then raise exception 'Unsupported event type'; end if;
  if p_side not in ('home', 'away') then raise exception 'Unsupported team side'; end if;

  select * into v_match from public.matches where id = p_match_id for update;
  if not found then raise exception 'Match not found'; end if;
  if v_match.status not in ('live', 'et_live') and not (v_match.status = 'ft' and v_match.locked_at is null) then
    raise exception 'Events can only be recorded while the match is live or deliberately reopened';
  end if;

  v_elapsed := coalesce(v_match.clock_elapsed_seconds, 0);
  if v_match.clock_started_at is not null then
    v_elapsed := v_elapsed + greatest(0, floor(extract(epoch from (clock_timestamp() - v_match.clock_started_at)))::int);
  end if;
  v_minute := greatest(1, ceil(v_elapsed / 60.0)::int);

  -- A second goal in the same displayed minute steps forward: 2', then 3'.
  if p_type = 'goal' then
    select greatest(v_minute, coalesce(max(e.display_minute) + 1, v_minute))
      into v_minute
      from public.events e
      where e.match_id = p_match_id and e.type = 'goal';
  end if;

  v_expected_team := case when p_side = 'home' then v_match.home_id else v_match.away_id end;
  if p_player_id is not null then
    select name into v_player_name from public.players where id = p_player_id and team_id = v_expected_team;
    if v_player_name is null then raise exception 'The selected player is not in this team squad'; end if;
  else
    v_player_name := nullif(trim(coalesce(p_player, '')), '');
  end if;
  if p_type = 'goal' and v_player_name is null then
    raise exception 'Choose the scorer or select Unknown scorer';
  end if;

  v_home := v_match.home_score + case when p_type = 'goal' and p_side = 'home' then 1 else 0 end;
  v_away := v_match.away_score + case when p_type = 'goal' and p_side = 'away' then 1 else 0 end;

  insert into public.events (
    match_id, minute, display_minute, elapsed_seconds, period, type, side,
    player_id, player, assist, recorded_by, home_score_after, away_score_after
  ) values (
    p_match_id, v_minute, v_minute, v_elapsed, greatest(v_match.current_period, 1), p_type, p_side,
    p_player_id, v_player_name, nullif(trim(coalesce(p_assist, '')), ''), auth.uid(), v_home, v_away
  ) returning * into v_event;

  update public.matches set home_score = v_home, away_score = v_away where id = p_match_id;
  insert into public.audit_logs (organization_id, match_id, actor_id, action, details)
  values (v_match.organization_id, p_match_id, auth.uid(), 'match.event.recorded', jsonb_build_object('event_id', v_event.id, 'type', p_type, 'side', p_side));
  return v_event;
end;
$$;

create or replace function public.delete_match_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_match public.matches%rowtype;
  v_home integer;
  v_away integer;
begin
  select * into v_event from public.events where id = p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not public.can_score_match(v_event.match_id) then raise exception 'You are not assigned to score this match'; end if;
  select * into v_match from public.matches where id = v_event.match_id for update;
  if v_match.status = 'ft' and v_match.locked_at is not null then raise exception 'This match is locked at full time'; end if;

  delete from public.events where id = p_event_id;
  select count(*) filter (where type = 'goal' and side = 'home')::int,
         count(*) filter (where type = 'goal' and side = 'away')::int
    into v_home, v_away
    from public.events where match_id = v_event.match_id;
  update public.matches set home_score = v_home, away_score = v_away where id = v_event.match_id;

  with running as (
    select e.id,
           sum(case when e.type = 'goal' and e.side = 'home' then 1 else 0 end)
             over (order by coalesce(e.elapsed_seconds, 0), e.created_at, e.id) as hs,
           sum(case when e.type = 'goal' and e.side = 'away' then 1 else 0 end)
             over (order by coalesce(e.elapsed_seconds, 0), e.created_at, e.id) as aws
    from public.events e where e.match_id = v_event.match_id
  )
  update public.events e set home_score_after = running.hs, away_score_after = running.aws
  from running where e.id = running.id;

  insert into public.audit_logs (organization_id, match_id, actor_id, action, details)
  values (v_match.organization_id, v_match.id, auth.uid(), 'match.event.deleted', jsonb_build_object('event_id', p_event_id, 'type', v_event.type, 'side', v_event.side));
end;
$$;

-- ---------------------------------------------------------------------------
-- New-user bootstrap and locked-down RLS
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_is_first boolean;
begin
  select not exists (select 1 from public.organizations) into v_is_first;
  insert into public.profiles (id, email, role, status)
  values (new.id, new.email, case when v_is_first then 'admin' else 'scorer' end, 'active')
  on conflict (id) do update set email = excluded.email;

  if v_is_first then
    insert into public.organizations (name, slug, created_by)
    values ('Touchline', 'touchline', new.id) returning id into v_org;
    insert into public.organization_members (organization_id, user_id, role)
    values (v_org, new.id, 'admin');
    update public.competitions set organization_id = v_org where organization_id is null;
    update public.teams set organization_id = v_org where organization_id is null;
    update public.matches set organization_id = v_org where organization_id is null;
  elsif (select count(*) from public.organizations) = 1 then
    select id into v_org from public.organizations limit 1;
    insert into public.organization_members (organization_id, user_id, role)
    values (v_org, new.id, 'scorer')
    on conflict (organization_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.competitions enable row level security;
alter table public.teams enable row level security;
alter table public.matches enable row level security;
alter table public.events enable row level security;
alter table public.players enable row level security;
alter table public.match_scorers enable row level security;
alter table public.audit_logs enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "read competitions" on public.competitions;
drop policy if exists "write competitions" on public.competitions;
drop policy if exists "read teams" on public.teams;
drop policy if exists "write teams" on public.teams;
drop policy if exists "read matches" on public.matches;
drop policy if exists "write matches" on public.matches;
drop policy if exists "read events" on public.events;
drop policy if exists "write events" on public.events;
drop policy if exists "read players" on public.players;
drop policy if exists "write players" on public.players;
drop policy if exists "read own profile" on public.profiles;
drop policy if exists "update own profile" on public.profiles;

create policy "public read organizations" on public.organizations for select using (true);
create policy "active users create organizations" on public.organizations for insert
  with check (public.is_active_user() and created_by = auth.uid());
create policy "organization admins update organizations" on public.organizations for update
  using (public.is_org_admin(id)) with check (public.is_org_admin(id));

create policy "members read own memberships" on public.organization_members for select
  using (user_id = auth.uid() or public.is_org_admin(organization_id));
create policy "organization admins add members" on public.organization_members for insert
  with check (public.is_org_admin(organization_id));
create policy "organization admins update members" on public.organization_members for update
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));
create policy "organization admins remove members" on public.organization_members for delete
  using (public.is_org_admin(organization_id));

create policy "public read competitions" on public.competitions for select using (true);
create policy "organization admins create competitions" on public.competitions for insert
  with check (public.is_org_admin(organization_id));
create policy "organization admins update competitions" on public.competitions for update
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));
create policy "organization admins delete competitions" on public.competitions for delete
  using (public.is_org_admin(organization_id));

create policy "public read teams" on public.teams for select using (true);
create policy "organization admins create teams" on public.teams for insert
  with check (public.is_org_admin(organization_id));
create policy "organization admins update teams" on public.teams for update
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));
create policy "organization admins delete teams" on public.teams for delete
  using (public.is_org_admin(organization_id));

create policy "public read matches" on public.matches for select using (true);
create policy "organization admins create matches" on public.matches for insert
  with check (public.is_org_admin(organization_id));
create policy "organization admins delete matches" on public.matches for delete
  using (public.is_org_admin(organization_id));

create policy "public read events" on public.events for select using (true);

create policy "public read players" on public.players for select using (true);
create policy "organization admins create players" on public.players for insert
  with check (exists (select 1 from public.teams t where t.id = team_id and public.is_org_admin(t.organization_id)));
create policy "organization admins update players" on public.players for update
  using (exists (select 1 from public.teams t where t.id = team_id and public.is_org_admin(t.organization_id)))
  with check (exists (select 1 from public.teams t where t.id = team_id and public.is_org_admin(t.organization_id)));
create policy "organization admins delete players" on public.players for delete
  using (exists (select 1 from public.teams t where t.id = team_id and public.is_org_admin(t.organization_id)));

create policy "assigned scorers read assignments" on public.match_scorers for select
  using (user_id = auth.uid() or exists (select 1 from public.matches m where m.id = match_id and public.is_org_admin(m.organization_id)));
create policy "organization admins assign scorers" on public.match_scorers for insert
  with check (exists (select 1 from public.matches m where m.id = match_id and public.is_org_admin(m.organization_id)));
create policy "organization admins remove scorers" on public.match_scorers for delete
  using (exists (select 1 from public.matches m where m.id = match_id and public.is_org_admin(m.organization_id)));

create policy "organization admins read audit logs" on public.audit_logs for select
  using (public.is_org_admin(organization_id));

create policy "users read own profile" on public.profiles for select
  using (public.can_view_profile(id));

-- Direct event writes and self-service role edits intentionally have no policy.
-- All match event mutations go through the checked RPC functions above.

revoke all on function public.transition_match_status(uuid, text) from public;
revoke all on function public.reopen_match(uuid, text) from public;
revoke all on function public.record_match_event(uuid, text, text, uuid, text, text) from public;
revoke all on function public.delete_match_event(uuid) from public;
grant execute on function public.transition_match_status(uuid, text) to authenticated;
grant execute on function public.reopen_match(uuid, text) to authenticated;
grant execute on function public.record_match_event(uuid, text, text, uuid, text, text) to authenticated;
grant execute on function public.delete_match_event(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'matches'
  ) then alter publication supabase_realtime add table public.matches; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events'
  ) then alter publication supabase_realtime add table public.events; end if;
end $$;

commit;
