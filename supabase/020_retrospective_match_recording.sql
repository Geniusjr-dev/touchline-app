-- Touchline migration 020
-- Adds retrospective match recording with manual event times.

begin;

alter table public.matches
  add column if not exists operation_mode text not null default 'live';

alter table public.matches drop constraint if exists matches_operation_mode_check;
alter table public.matches
  add constraint matches_operation_mode_check
  check (operation_mode in ('live', 'retrospective'));

create or replace function public.start_match_with_kits(
  p_match_id uuid,
  p_home_kit_color text,
  p_away_kit_color text
)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_home text := upper(trim(p_home_kit_color));
  v_away text := upper(trim(p_away_kit_color));
begin
  if not public.can_score_match(p_match_id) then
    raise exception 'You are not assigned to score this match';
  end if;

  select * into v_match from public.matches where id = p_match_id for update;
  if not found then raise exception 'Match not found'; end if;
  if v_match.status <> 'scheduled' then
    raise exception 'Match kits can only be confirmed at kick-off';
  end if;
  if v_home !~ '^#[0-9A-F]{6}$' or v_away !~ '^#[0-9A-F]{6}$' then
    raise exception 'Choose valid home and away kit colours';
  end if;
  if not public.kit_colours_are_distinct(v_home, v_away) then
    raise exception 'The home and away kits clash. Choose a different away kit';
  end if;

  update public.matches
  set home_kit_color = v_home,
      away_kit_color = v_away,
      operation_mode = 'live'
  where id = p_match_id
  returning * into v_match;

  insert into public.audit_logs (organization_id, match_id, actor_id, action, details)
  values (
    v_match.organization_id,
    p_match_id,
    auth.uid(),
    'match.kits',
    jsonb_build_object('home', v_home, 'away', v_away, 'operation_mode', 'live')
  );

  return public.transition_match_status(p_match_id, 'live');
end;
$$;

create or replace function public.start_retrospective_match(
  p_match_id uuid,
  p_home_kit_color text,
  p_away_kit_color text
)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_home text := upper(trim(p_home_kit_color));
  v_away text := upper(trim(p_away_kit_color));
begin
  if not public.can_score_match(p_match_id) then
    raise exception 'You are not assigned to score this match';
  end if;

  select * into v_match from public.matches where id = p_match_id for update;
  if not found then raise exception 'Match not found'; end if;
  if v_match.status <> 'scheduled' then
    raise exception 'Only a scheduled match can start retrospective recording';
  end if;
  if v_home !~ '^#[0-9A-F]{6}$' or v_away !~ '^#[0-9A-F]{6}$' then
    raise exception 'Choose valid home and away kit colours';
  end if;
  if not public.kit_colours_are_distinct(v_home, v_away) then
    raise exception 'The home and away kits clash. Choose a different away kit';
  end if;

  update public.matches
  set home_kit_color = v_home,
      away_kit_color = v_away,
      operation_mode = 'retrospective',
      status = 'live',
      current_period = 1,
      clock_elapsed_seconds = 0,
      clock_started_at = null,
      locked_at = null,
      reopened_at = null,
      reopened_by = null,
      reopen_reason = null
  where id = p_match_id
  returning * into v_match;

  insert into public.audit_logs (organization_id, match_id, actor_id, action, details)
  values (
    v_match.organization_id,
    p_match_id,
    auth.uid(),
    'match.retrospective.started',
    jsonb_build_object('home_kit', v_home, 'away_kit', v_away)
  );

  return v_match;
end;
$$;

create or replace function public.transition_retrospective_match(
  p_match_id uuid,
  p_status text
)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_duration integer;
begin
  if not public.can_score_match(p_match_id) then
    raise exception 'You are not assigned to score this match';
  end if;
  if p_status not in ('live', 'ht', 'ft') then
    raise exception 'Unsupported retrospective match status';
  end if;

  select * into v_match from public.matches where id = p_match_id for update;
  if not found then raise exception 'Match not found'; end if;
  if v_match.operation_mode <> 'retrospective' then
    raise exception 'This match is not in retrospective recording mode';
  end if;

  select coalesce(c.match_duration_minutes, 90)
    into v_duration
  from public.matches m
  left join public.competitions c on c.id = m.competition_id
  where m.id = p_match_id;

  if p_status = 'ht' then
    if v_match.status <> 'live' or coalesce(v_match.current_period, 1) <> 1 then
      raise exception 'Only the first half can move to half time';
    end if;
    update public.matches
    set status = 'ht',
        current_period = 1,
        clock_elapsed_seconds = v_duration * 30,
        clock_started_at = null
    where id = p_match_id
    returning * into v_match;
  elsif p_status = 'live' then
    if v_match.status <> 'ht' then
      raise exception 'Start the second half from half time';
    end if;
    update public.matches
    set status = 'live',
        current_period = 2,
        clock_elapsed_seconds = v_duration * 30,
        clock_started_at = null,
        locked_at = null
    where id = p_match_id
    returning * into v_match;
  else
    if v_match.status not in ('live', 'ht', 'ft') then
      raise exception 'This match cannot be finished from its current state';
    end if;
    update public.matches
    set status = 'ft',
        current_period = greatest(coalesce(current_period, 1), 2),
        clock_elapsed_seconds = v_duration * 60,
        clock_started_at = null,
        locked_at = clock_timestamp()
    where id = p_match_id
    returning * into v_match;
  end if;

  insert into public.audit_logs (organization_id, match_id, actor_id, action, details)
  values (
    v_match.organization_id,
    p_match_id,
    auth.uid(),
    'match.retrospective.status',
    jsonb_build_object('status', p_status, 'period', v_match.current_period)
  );

  return v_match;
end;
$$;

create or replace function public.record_match_event_at(
  p_match_id uuid,
  p_type text,
  p_side text,
  p_player_id uuid,
  p_player text,
  p_assist text,
  p_goal_type text,
  p_card_type text,
  p_card_reason text,
  p_recipient_type text,
  p_display_minute integer,
  p_elapsed_seconds integer,
  p_period integer
)
returns public.events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_event public.events%rowtype;
  v_original_period integer;
  v_original_elapsed integer;
  v_duration integer;
  v_half integer;
begin
  if not public.can_score_match(p_match_id) then
    raise exception 'You are not assigned to score this match';
  end if;

  select * into v_match from public.matches where id = p_match_id for update;
  if not found then raise exception 'Match not found'; end if;
  if v_match.operation_mode <> 'retrospective' then
    raise exception 'Manual event times are available only in retrospective recording mode';
  end if;
  if v_match.status not in ('live', 'et_live')
     and not (v_match.status = 'ft' and v_match.locked_at is null) then
    raise exception 'Events can be added only during recording or after reopening the result';
  end if;

  select coalesce(c.match_duration_minutes, 90)
    into v_duration
  from public.matches m
  left join public.competitions c on c.id = m.competition_id
  where m.id = p_match_id;
  v_half := v_duration / 2;

  if p_period not in (1, 2) then
    raise exception 'Choose the first or second half';
  end if;
  if p_display_minute is null or p_display_minute < 1 or p_display_minute > v_duration + 45 then
    raise exception 'The event minute is outside the match range';
  end if;
  if p_period = 1 and p_display_minute > v_half + 45 then
    raise exception 'The first-half event minute is outside the allowed range';
  end if;
  if p_period = 2 and p_display_minute <= v_half then
    raise exception 'A second-half event must be after the half-time minute';
  end if;
  if p_elapsed_seconds is null or p_elapsed_seconds < 0 or p_elapsed_seconds > (v_duration + 45) * 60 + 59 then
    raise exception 'The event time is outside the match range';
  end if;

  v_original_period := coalesce(v_match.current_period, 1);
  v_original_elapsed := coalesce(v_match.clock_elapsed_seconds, 0);

  update public.matches
  set current_period = p_period,
      clock_elapsed_seconds = p_elapsed_seconds,
      clock_started_at = null
  where id = p_match_id;

  v_event := public.record_match_event(
    p_match_id,
    p_type,
    p_side,
    p_player_id,
    p_player,
    p_assist,
    p_goal_type,
    p_card_type,
    p_card_reason,
    p_recipient_type
  );

  update public.events
  set minute = p_display_minute,
      display_minute = p_display_minute,
      elapsed_seconds = p_elapsed_seconds,
      period = p_period
  where id = v_event.id;

  update public.matches
  set current_period = v_original_period,
      clock_elapsed_seconds = v_original_elapsed,
      clock_started_at = null
  where id = p_match_id;

  with running as (
    select
      event.id,
      count(*) filter (where event.type = 'goal' and event.side = 'home') over (
        order by coalesce(event.period, 1), coalesce(event.elapsed_seconds, 0), event.created_at, event.id
      )::integer as home_score,
      count(*) filter (where event.type = 'goal' and event.side = 'away') over (
        order by coalesce(event.period, 1), coalesce(event.elapsed_seconds, 0), event.created_at, event.id
      )::integer as away_score
    from public.events event
    where event.match_id = p_match_id
  )
  update public.events event
  set home_score_after = running.home_score,
      away_score_after = running.away_score
  from running
  where event.id = running.id;

  select * into v_event from public.events where id = v_event.id;

  insert into public.audit_logs (organization_id, match_id, actor_id, action, details)
  values (
    v_match.organization_id,
    p_match_id,
    auth.uid(),
    'match.event.manual_time',
    jsonb_build_object(
      'event_id', v_event.id,
      'display_minute', p_display_minute,
      'elapsed_seconds', p_elapsed_seconds,
      'period', p_period
    )
  );

  return v_event;
end;
$$;

revoke all on function public.start_match_with_kits(uuid, text, text) from public;
revoke all on function public.start_retrospective_match(uuid, text, text) from public;
revoke all on function public.transition_retrospective_match(uuid, text) from public;
revoke all on function public.record_match_event_at(uuid, text, text, uuid, text, text, text, text, text, text, integer, integer, integer) from public;

grant execute on function public.start_match_with_kits(uuid, text, text) to authenticated;
grant execute on function public.start_retrospective_match(uuid, text, text) to authenticated;
grant execute on function public.transition_retrospective_match(uuid, text) to authenticated;
grant execute on function public.record_match_event_at(uuid, text, text, uuid, text, text, text, text, text, text, integer, integer, integer) to authenticated;

commit;
