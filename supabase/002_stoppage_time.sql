-- Touchline Milestone 2: announced stoppage time and period-safe clocks.
-- Existing Touchline projects: run this file once in Supabase -> SQL Editor.

begin;

alter table public.competitions add column if not exists competition_type text not null default 'tournament';
update public.competitions
set competition_type = 'friendly'
where name ~* 'friend(ly|lies)' and competition_type = 'tournament';
alter table public.matches add column if not exists first_half_stoppage_minutes smallint not null default 0;
alter table public.matches add column if not exists second_half_stoppage_minutes smallint not null default 0;
alter table public.matches add column if not exists extra_time_first_half_stoppage_minutes smallint not null default 0;
alter table public.matches add column if not exists extra_time_second_half_stoppage_minutes smallint not null default 0;
create index if not exists events_match_period_elapsed_idx on public.events(match_id, period, elapsed_seconds, created_at);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'competitions_type_check') then
    alter table public.competitions add constraint competitions_type_check check (competition_type in ('tournament', 'friendly'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'matches_first_half_stoppage_check') then
    alter table public.matches add constraint matches_first_half_stoppage_check check (first_half_stoppage_minutes between 0 and 45);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'matches_second_half_stoppage_check') then
    alter table public.matches add constraint matches_second_half_stoppage_check check (second_half_stoppage_minutes between 0 and 45);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'matches_extra_time_first_half_stoppage_check') then
    alter table public.matches add constraint matches_extra_time_first_half_stoppage_check check (extra_time_first_half_stoppage_minutes between 0 and 45);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'matches_extra_time_second_half_stoppage_check') then
    alter table public.matches add constraint matches_extra_time_second_half_stoppage_check check (extra_time_second_half_stoppage_minutes between 0 and 45);
  end if;
end $$;

create or replace function public.set_match_stoppage_time(p_match_id uuid, p_minutes integer)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
begin
  if not public.can_score_match(p_match_id) then
    raise exception 'You are not assigned to score this match';
  end if;
  if p_minutes is null or p_minutes < 0 or p_minutes > 45 then
    raise exception 'Stoppage time must be between 0 and 45 minutes';
  end if;

  select * into v_match from public.matches where id = p_match_id for update;
  if not found then raise exception 'Match not found'; end if;
  if v_match.status not in ('live', 'et_live') then
    raise exception 'Stoppage time can only be announced while a period is live';
  end if;

  update public.matches
  set first_half_stoppage_minutes = case when v_match.current_period = 1 then p_minutes else first_half_stoppage_minutes end,
      second_half_stoppage_minutes = case when v_match.current_period = 2 then p_minutes else second_half_stoppage_minutes end,
      extra_time_first_half_stoppage_minutes = case when v_match.current_period = 3 then p_minutes else extra_time_first_half_stoppage_minutes end,
      extra_time_second_half_stoppage_minutes = case when v_match.current_period = 4 then p_minutes else extra_time_second_half_stoppage_minutes end
  where id = p_match_id
  returning * into v_match;

  insert into public.audit_logs (organization_id, match_id, actor_id, action, details)
  values (
    v_match.organization_id,
    p_match_id,
    auth.uid(),
    'match.stoppage_time',
    jsonb_build_object('period', v_match.current_period, 'minutes', p_minutes)
  );
  return v_match;
end;
$$;

-- Resume each new period from its official clock boundary. This prevents first-
-- half stoppage time from incorrectly pushing the second-half clock forward.
create or replace function public.transition_match_status(p_match_id uuid, p_status text)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_elapsed integer;
  v_duration integer;
  v_extra_time integer;
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

  select coalesce(c.match_duration_minutes, 90), coalesce(c.extra_time_minutes, 30)
    into v_duration, v_extra_time
  from public.matches m
  left join public.competitions c on c.id = m.competition_id
  where m.id = p_match_id;

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
          reopened_by = null, reopen_reason = null,
          first_half_stoppage_minutes = 0, second_half_stoppage_minutes = 0,
          extra_time_first_half_stoppage_minutes = 0,
          extra_time_second_half_stoppage_minutes = 0
      where id = p_match_id returning * into v_match;
  elsif p_status = 'live' then
    if v_match.status not in ('scheduled', 'ht', 'live') then
      raise exception 'This match cannot enter regular live play from its current state';
    end if;
    update public.matches
      set status = 'live',
          current_period = case when v_match.status = 'scheduled' then 1 when v_match.status = 'ht' then 2 else greatest(v_match.current_period, 1) end,
          clock_elapsed_seconds = case
            when v_match.status = 'scheduled' then 0
            when v_match.status = 'ht' then v_duration * 30
            else v_elapsed
          end,
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
          clock_elapsed_seconds = case
            when v_match.status = 'ft' then v_duration * 60
            when v_match.status = 'et_ht' then v_duration * 60 + v_extra_time * 30
            else v_elapsed
          end,
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

-- Keep same-minute goal stepping within the current period. Without the period
-- filter, a first-half stoppage-time goal could push an early second-half goal
-- to the wrong displayed minute.
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

  if p_type = 'goal' then
    select greatest(v_minute, coalesce(max(e.display_minute) + 1, v_minute))
      into v_minute
      from public.events e
      where e.match_id = p_match_id
        and e.type = 'goal'
        and coalesce(e.period, 1) = greatest(v_match.current_period, 1);
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
             over (order by coalesce(e.period, 1), coalesce(e.elapsed_seconds, 0), e.created_at, e.id) as hs,
           sum(case when e.type = 'goal' and e.side = 'away' then 1 else 0 end)
             over (order by coalesce(e.period, 1), coalesce(e.elapsed_seconds, 0), e.created_at, e.id) as aws
    from public.events e where e.match_id = v_event.match_id
  )
  update public.events e set home_score_after = running.hs, away_score_after = running.aws
  from running where e.id = running.id;

  insert into public.audit_logs (organization_id, match_id, actor_id, action, details)
  values (v_match.organization_id, v_match.id, auth.uid(), 'match.event.deleted', jsonb_build_object('event_id', p_event_id, 'type', v_event.type, 'side', v_event.side));
end;
$$;

revoke all on function public.set_match_stoppage_time(uuid, integer) from public;
grant execute on function public.set_match_stoppage_time(uuid, integer) to authenticated;

commit;
