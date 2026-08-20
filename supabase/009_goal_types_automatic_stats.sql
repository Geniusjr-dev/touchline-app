begin;

alter table public.events
  add column if not exists goal_type text;

alter table public.events
  add column if not exists automatic_stats_applied boolean not null default false;

update public.events
set goal_type = 'direct_goal'
where type = 'goal' and goal_type is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'events_goal_type_check'
      and conrelid = 'public.events'::regclass
  ) then
    alter table public.events
      add constraint events_goal_type_check check (
        (type = 'goal' and goal_type in ('direct_goal', 'penalty', 'own_goal', 'free_kick'))
        or (type <> 'goal' and goal_type is null)
      );
  end if;
end $$;

create or replace function public.record_match_event(
  p_match_id uuid,
  p_type text,
  p_side text,
  p_player_id uuid,
  p_player text,
  p_assist text,
  p_goal_type text
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
  v_assist_name text;
  v_goal_type text;
  v_home integer;
  v_away integer;
  v_expected_team uuid;
begin
  if not public.can_score_match(p_match_id) then
    raise exception 'You are not assigned to score this match';
  end if;
  if p_type not in ('goal', 'yellow', 'red', 'sub', 'miss') then
    raise exception 'Unsupported event type';
  end if;
  if p_side not in ('home', 'away') then
    raise exception 'Unsupported team side';
  end if;

  select * into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Match not found';
  end if;
  if v_match.status not in ('live', 'et_live')
     and not (v_match.status = 'ft' and v_match.locked_at is null) then
    raise exception 'Events can only be recorded while the match is live or deliberately reopened';
  end if;

  v_goal_type := case
    when p_type = 'goal' then coalesce(nullif(trim(coalesce(p_goal_type, '')), ''), 'direct_goal')
    else null
  end;

  if p_type = 'goal'
     and v_goal_type not in ('direct_goal', 'penalty', 'own_goal', 'free_kick') then
    raise exception 'Unsupported goal type';
  end if;

  v_elapsed := coalesce(v_match.clock_elapsed_seconds, 0);
  if v_match.clock_started_at is not null then
    v_elapsed := v_elapsed
      + greatest(0, floor(extract(epoch from (clock_timestamp() - v_match.clock_started_at)))::int);
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

  v_expected_team := case
    when p_type = 'goal' and v_goal_type = 'own_goal' and p_side = 'home' then v_match.away_id
    when p_type = 'goal' and v_goal_type = 'own_goal' and p_side = 'away' then v_match.home_id
    when p_side = 'home' then v_match.home_id
    else v_match.away_id
  end;

  if p_player_id is not null then
    select name into v_player_name
    from public.players
    where id = p_player_id and team_id = v_expected_team;

    if v_player_name is null then
      raise exception 'The selected player is not in the correct team squad';
    end if;
  else
    v_player_name := nullif(trim(coalesce(p_player, '')), '');
  end if;

  v_assist_name := case
    when p_type = 'goal' and v_goal_type <> 'own_goal'
      then nullif(trim(coalesce(p_assist, '')), '')
    when p_type = 'sub'
      then nullif(trim(coalesce(p_assist, '')), '')
    else null
  end;

  v_home := v_match.home_score
    + case when p_type = 'goal' and p_side = 'home' then 1 else 0 end;
  v_away := v_match.away_score
    + case when p_type = 'goal' and p_side = 'away' then 1 else 0 end;

  insert into public.events (
    match_id,
    minute,
    display_minute,
    elapsed_seconds,
    period,
    type,
    side,
    player_id,
    player,
    assist,
    goal_type,
    automatic_stats_applied,
    recorded_by,
    home_score_after,
    away_score_after
  ) values (
    p_match_id,
    v_minute,
    v_minute,
    v_elapsed,
    greatest(v_match.current_period, 1),
    p_type,
    p_side,
    p_player_id,
    v_player_name,
    v_assist_name,
    v_goal_type,
    p_type in ('goal', 'yellow', 'red'),
    auth.uid(),
    v_home,
    v_away
  ) returning * into v_event;

  update public.matches
  set home_score = v_home, away_score = v_away
  where id = p_match_id;

  if p_type in ('goal', 'yellow', 'red') then
    insert into public.match_statistics (match_id, updated_by, updated_at)
    values (p_match_id, auth.uid(), clock_timestamp())
    on conflict (match_id) do nothing;

    update public.match_statistics
    set
      home_total_shots = home_total_shots + case
        when p_type = 'goal' and v_goal_type <> 'own_goal' and p_side = 'home' then 1 else 0 end,
      away_total_shots = away_total_shots + case
        when p_type = 'goal' and v_goal_type <> 'own_goal' and p_side = 'away' then 1 else 0 end,
      home_shots_on_target = home_shots_on_target + case
        when p_type = 'goal' and v_goal_type <> 'own_goal' and p_side = 'home' then 1 else 0 end,
      away_shots_on_target = away_shots_on_target + case
        when p_type = 'goal' and v_goal_type <> 'own_goal' and p_side = 'away' then 1 else 0 end,
      home_yellow_cards = home_yellow_cards + case
        when p_type = 'yellow' and p_side = 'home' then 1 else 0 end,
      away_yellow_cards = away_yellow_cards + case
        when p_type = 'yellow' and p_side = 'away' then 1 else 0 end,
      home_red_cards = home_red_cards + case
        when p_type = 'red' and p_side = 'home' then 1 else 0 end,
      away_red_cards = away_red_cards + case
        when p_type = 'red' and p_side = 'away' then 1 else 0 end,
      updated_by = auth.uid(),
      updated_at = clock_timestamp()
    where match_id = p_match_id;
  end if;

  insert into public.audit_logs (organization_id, match_id, actor_id, action, details)
  values (
    v_match.organization_id,
    p_match_id,
    auth.uid(),
    'match.event.recorded',
    jsonb_build_object(
      'event_id', v_event.id,
      'type', p_type,
      'side', p_side,
      'goal_type', v_goal_type
    )
  );

  return v_event;
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
begin
  return public.record_match_event(
    p_match_id,
    p_type,
    p_side,
    p_player_id,
    p_player,
    p_assist,
    case when p_type = 'goal' then 'direct_goal' else null end
  );
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
  select * into v_event
  from public.events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'Event not found';
  end if;
  if not public.can_score_match(v_event.match_id) then
    raise exception 'You are not assigned to score this match';
  end if;

  select * into v_match
  from public.matches
  where id = v_event.match_id
  for update;

  if v_match.status = 'ft' and v_match.locked_at is not null then
    raise exception 'This match is locked at full time';
  end if;

  delete from public.events where id = p_event_id;

  select
    count(*) filter (where type = 'goal' and side = 'home')::int,
    count(*) filter (where type = 'goal' and side = 'away')::int
  into v_home, v_away
  from public.events
  where match_id = v_event.match_id;

  update public.matches
  set home_score = v_home, away_score = v_away
  where id = v_event.match_id;

  if v_event.automatic_stats_applied then
    update public.match_statistics
    set
      home_total_shots = greatest(0, home_total_shots - case
        when v_event.type = 'goal'
          and coalesce(v_event.goal_type, 'direct_goal') <> 'own_goal'
          and v_event.side = 'home' then 1 else 0 end),
      away_total_shots = greatest(0, away_total_shots - case
        when v_event.type = 'goal'
          and coalesce(v_event.goal_type, 'direct_goal') <> 'own_goal'
          and v_event.side = 'away' then 1 else 0 end),
      home_shots_on_target = greatest(0, home_shots_on_target - case
        when v_event.type = 'goal'
          and coalesce(v_event.goal_type, 'direct_goal') <> 'own_goal'
          and v_event.side = 'home' then 1 else 0 end),
      away_shots_on_target = greatest(0, away_shots_on_target - case
        when v_event.type = 'goal'
          and coalesce(v_event.goal_type, 'direct_goal') <> 'own_goal'
          and v_event.side = 'away' then 1 else 0 end),
      home_yellow_cards = greatest(0, home_yellow_cards - case
        when v_event.type = 'yellow' and v_event.side = 'home' then 1 else 0 end),
      away_yellow_cards = greatest(0, away_yellow_cards - case
        when v_event.type = 'yellow' and v_event.side = 'away' then 1 else 0 end),
      home_red_cards = greatest(0, home_red_cards - case
        when v_event.type = 'red' and v_event.side = 'home' then 1 else 0 end),
      away_red_cards = greatest(0, away_red_cards - case
        when v_event.type = 'red' and v_event.side = 'away' then 1 else 0 end),
      updated_by = auth.uid(),
      updated_at = clock_timestamp()
    where match_id = v_event.match_id;
  end if;

  with running as (
    select
      e.id,
      sum(case when e.type = 'goal' and e.side = 'home' then 1 else 0 end)
        over (
          order by coalesce(e.period, 1), coalesce(e.elapsed_seconds, 0), e.created_at, e.id
        ) as home_score,
      sum(case when e.type = 'goal' and e.side = 'away' then 1 else 0 end)
        over (
          order by coalesce(e.period, 1), coalesce(e.elapsed_seconds, 0), e.created_at, e.id
        ) as away_score
    from public.events e
    where e.match_id = v_event.match_id
  )
  update public.events e
  set
    home_score_after = running.home_score,
    away_score_after = running.away_score
  from running
  where e.id = running.id;

  insert into public.audit_logs (organization_id, match_id, actor_id, action, details)
  values (
    v_match.organization_id,
    v_match.id,
    auth.uid(),
    'match.event.deleted',
    jsonb_build_object(
      'event_id', p_event_id,
      'type', v_event.type,
      'side', v_event.side,
      'goal_type', v_event.goal_type
    )
  );
end;
$$;

revoke all on function public.record_match_event(uuid, text, text, uuid, text, text, text) from public;
revoke all on function public.record_match_event(uuid, text, text, uuid, text, text) from public;
revoke all on function public.delete_match_event(uuid) from public;

grant execute on function public.record_match_event(uuid, text, text, uuid, text, text, text) to authenticated;
grant execute on function public.record_match_event(uuid, text, text, uuid, text, text) to authenticated;
grant execute on function public.delete_match_event(uuid) to authenticated;

commit;
