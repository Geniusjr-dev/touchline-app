-- Touchline migration 019
-- Enforces a complete starting eleven and supports delayed, on-field goal attribution.

begin;

alter table public.events
  add column if not exists attributed_at timestamptz;

alter table public.events
  add column if not exists attributed_by uuid references public.profiles(id) on delete set null;

create or replace function public.save_match_lineup_positions(
  p_match_id uuid,
  p_team_id uuid,
  p_formation text,
  p_starters uuid[],
  p_starter_slots integer[],
  p_substitutes uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_starters uuid[] := coalesce(p_starters, array[]::uuid[]);
  v_starter_slots integer[] := coalesce(p_starter_slots, array[]::integer[]);
  v_substitutes uuid[] := coalesce(p_substitutes, array[]::uuid[]);
  v_all_players uuid[];
  v_registered_count integer;
  v_formation text := nullif(btrim(coalesce(p_formation, '')), '');
  v_goalkeeper_id uuid;
begin
  select * into v_match
  from public.matches
  where id = p_match_id;

  if not found then
    raise exception 'This match was not found';
  end if;

  if not public.can_score_match(p_match_id) then
    raise exception 'You are not authorised to manage this match lineup';
  end if;

  if p_team_id is distinct from v_match.home_id and p_team_id is distinct from v_match.away_id then
    raise exception 'The selected team is not playing in this match';
  end if;

  if cardinality(v_starters) <> cardinality(v_starter_slots) then
    raise exception 'Every starter must have one formation position';
  end if;

  if cardinality(v_starters) <> 11 then
    raise exception 'A published lineup must contain exactly 11 starters';
  end if;

  if v_formation is null then
    raise exception 'Select a formation before publishing the lineup';
  end if;

  if char_length(v_formation) > 30 then
    raise exception 'The formation is too long';
  end if;

  if exists (
    select 1
    from unnest(v_starter_slots) as selected(slot_index)
    where selected.slot_index not between 0 and 10
  ) then
    raise exception 'A lineup position is invalid';
  end if;

  if exists (
    select 1
    from unnest(v_starter_slots) as selected(slot_index)
    group by selected.slot_index
    having count(*) > 1
  ) then
    raise exception 'A formation position can contain only one player';
  end if;

  if not (0 = any(v_starter_slots)) then
    raise exception 'Select a goalkeeper before publishing the lineup';
  end if;

  v_all_players := v_starters || v_substitutes;

  if exists (
    select 1
    from unnest(v_all_players) as selected(player_id)
    group by selected.player_id
    having count(*) > 1
  ) then
    raise exception 'A player cannot be selected more than once';
  end if;

  select count(*) into v_registered_count
  from public.players
  where team_id = p_team_id
    and id = any(v_all_players);

  if v_registered_count <> cardinality(v_all_players) then
    raise exception 'Every selected player must belong to this team squad';
  end if;

  select selected.player_id into v_goalkeeper_id
  from unnest(v_starters, v_starter_slots) as selected(player_id, slot_index)
  where selected.slot_index = 0;

  if not exists (
    select 1
    from public.players
    where id = v_goalkeeper_id
      and team_id = p_team_id
      and lower(coalesce(position, '')) ~ '(goalkeeper|keeper|(^|[^a-z])gk([^a-z]|$))'
  ) then
    raise exception 'The goalkeeper position must contain a registered goalkeeper';
  end if;

  if exists (
    select 1
    from unnest(v_starters, v_starter_slots) as selected(player_id, slot_index)
    join public.players player on player.id = selected.player_id
    where selected.slot_index <> 0
      and lower(coalesce(player.position, '')) ~ '(goalkeeper|keeper|(^|[^a-z])gk([^a-z]|$))'
  ) then
    raise exception 'A goalkeeper cannot be assigned to an outfield position';
  end if;

  delete from public.match_lineups
  where match_id = p_match_id and team_id = p_team_id;

  insert into public.match_lineups (
    match_id,
    team_id,
    player_id,
    role,
    formation,
    sort_order,
    slot_index
  )
  select
    p_match_id,
    p_team_id,
    selected.player_id,
    'starter',
    v_formation,
    selected.ordinality::integer,
    selected.slot_index
  from unnest(v_starters, v_starter_slots) with ordinality
    as selected(player_id, slot_index, ordinality);

  insert into public.match_lineups (
    match_id,
    team_id,
    player_id,
    role,
    formation,
    sort_order,
    slot_index
  )
  select
    p_match_id,
    p_team_id,
    selected.player_id,
    'substitute',
    v_formation,
    selected.ordinality::integer,
    null
  from unnest(v_substitutes) with ordinality
    as selected(player_id, ordinality);
end;
$$;

create or replace function public.match_player_was_on_field(
  p_match_id uuid,
  p_team_id uuid,
  p_player_id uuid,
  p_before_event_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  with boundary as (
    select id, coalesce(period, 1) as period, coalesce(elapsed_seconds, 0) as elapsed_seconds, created_at
    from public.events
    where id = p_before_event_id and match_id = p_match_id
  ),
  player_record as (
    select name
    from public.players
    where id = p_player_id and team_id = p_team_id
  ),
  last_involvement as (
    select (event.player_id = p_player_id) as entered
    from public.events event
    cross join boundary
    cross join player_record
    where event.match_id = p_match_id
      and event.type = 'sub'
      and event.side = case
        when p_team_id = (select home_id from public.matches where id = p_match_id) then 'home'
        else 'away'
      end
      and (
        event.player_id = p_player_id
        or lower(btrim(coalesce(event.assist, ''))) = lower(btrim(player_record.name))
      )
      and (
        coalesce(event.period, 1),
        coalesce(event.elapsed_seconds, 0),
        event.created_at,
        event.id
      ) <= (
        boundary.period,
        boundary.elapsed_seconds,
        boundary.created_at,
        boundary.id
      )
    order by coalesce(event.period, 1) desc, coalesce(event.elapsed_seconds, 0) desc, event.created_at desc, event.id desc
    limit 1
  )
  select coalesce(
    (select entered from last_involvement),
    exists (
      select 1
      from public.match_lineups
      where match_id = p_match_id
        and team_id = p_team_id
        and player_id = p_player_id
        and role = 'starter'
    )
  );
$$;

create or replace function public.attribute_match_goal(
  p_event_id uuid,
  p_player_id uuid default null,
  p_assist_id uuid default null,
  p_goal_type text default 'normal_goal'
)
returns public.events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_match public.matches%rowtype;
  v_goal_type text := coalesce(nullif(btrim(coalesce(p_goal_type, '')), ''), 'normal_goal');
  v_previous_goal_type text;
  v_scoring_team_id uuid;
  v_scorer_team_id uuid;
  v_player_name text;
  v_assist_name text;
  v_variant_prefix text;
begin
  select * into v_event
  from public.events
  where id = p_event_id
  for update;

  if not found or v_event.type <> 'goal' then
    raise exception 'This goal event was not found';
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

  if v_goal_type = 'direct_goal' then
    v_goal_type := 'normal_goal';
  end if;
  if v_goal_type not in ('normal_goal', 'penalty', 'own_goal', 'free_kick') then
    raise exception 'Unsupported goal type';
  end if;

  v_scoring_team_id := case when v_event.side = 'home' then v_match.home_id else v_match.away_id end;
  v_scorer_team_id := case
    when v_goal_type = 'own_goal' and v_event.side = 'home' then v_match.away_id
    when v_goal_type = 'own_goal' and v_event.side = 'away' then v_match.home_id
    else v_scoring_team_id
  end;

  if p_player_id is not null then
    select name into v_player_name
    from public.players
    where id = p_player_id and team_id = v_scorer_team_id;

    if v_player_name is null then
      raise exception 'The selected scorer is not in the correct team squad';
    end if;
    if not public.match_player_was_on_field(v_event.match_id, v_scorer_team_id, p_player_id, p_event_id) then
      raise exception 'Only a player who was on the field can be credited with this goal';
    end if;
  end if;

  if p_assist_id is not null then
    if v_goal_type <> 'normal_goal' then
      raise exception 'An assist can only be added to a normal goal';
    end if;
    if p_assist_id = p_player_id then
      raise exception 'The scorer cannot also be credited with the assist';
    end if;

    select name into v_assist_name
    from public.players
    where id = p_assist_id and team_id = v_scoring_team_id;

    if v_assist_name is null then
      raise exception 'The selected assister is not in the scoring team squad';
    end if;
    if not public.match_player_was_on_field(v_event.match_id, v_scoring_team_id, p_assist_id, p_event_id) then
      raise exception 'Only a player who was on the field can be credited with the assist';
    end if;
  end if;

  v_previous_goal_type := coalesce(v_event.goal_type, 'normal_goal');

  if v_event.automatic_stats_applied and v_previous_goal_type <> v_goal_type then
    update public.match_statistics
    set
      home_total_shots = greatest(0, home_total_shots + case
        when v_event.side = 'home' and v_previous_goal_type = 'own_goal' and v_goal_type <> 'own_goal' then 1
        when v_event.side = 'home' and v_previous_goal_type <> 'own_goal' and v_goal_type = 'own_goal' then -1
        else 0 end),
      away_total_shots = greatest(0, away_total_shots + case
        when v_event.side = 'away' and v_previous_goal_type = 'own_goal' and v_goal_type <> 'own_goal' then 1
        when v_event.side = 'away' and v_previous_goal_type <> 'own_goal' and v_goal_type = 'own_goal' then -1
        else 0 end),
      home_shots_on_target = greatest(0, home_shots_on_target + case
        when v_event.side = 'home' and v_previous_goal_type = 'own_goal' and v_goal_type <> 'own_goal' then 1
        when v_event.side = 'home' and v_previous_goal_type <> 'own_goal' and v_goal_type = 'own_goal' then -1
        else 0 end),
      away_shots_on_target = greatest(0, away_shots_on_target + case
        when v_event.side = 'away' and v_previous_goal_type = 'own_goal' and v_goal_type <> 'own_goal' then 1
        when v_event.side = 'away' and v_previous_goal_type <> 'own_goal' and v_goal_type = 'own_goal' then -1
        else 0 end),
      updated_by = auth.uid(),
      updated_at = clock_timestamp()
    where match_id = v_event.match_id;
  end if;

  v_variant_prefix := case
    when v_goal_type = 'own_goal' then 'own_goal'
    when v_goal_type = 'penalty' then 'penalty_goal'
    when v_goal_type = 'free_kick' then 'free_kick_goal'
    else 'normal_general'
  end;

  update public.events
  set
    player_id = p_player_id,
    player = v_player_name,
    assist = v_assist_name,
    goal_type = v_goal_type,
    commentary_variant_key = public.next_commentary_variant(v_event.match_id, v_variant_prefix, 4),
    attributed_at = clock_timestamp(),
    attributed_by = auth.uid()
  where id = p_event_id
  returning * into v_event;

  insert into public.audit_logs (organization_id, match_id, actor_id, action, details)
  values (
    v_match.organization_id,
    v_match.id,
    auth.uid(),
    'match.goal.attributed',
    jsonb_build_object(
      'event_id', p_event_id,
      'player_id', p_player_id,
      'assist_id', p_assist_id,
      'goal_type', v_goal_type
    )
  );

  return v_event;
end;
$$;

revoke all on function public.save_match_lineup_positions(uuid, uuid, text, uuid[], integer[], uuid[]) from public;
grant execute on function public.save_match_lineup_positions(uuid, uuid, text, uuid[], integer[], uuid[]) to authenticated;

revoke all on function public.match_player_was_on_field(uuid, uuid, uuid, uuid) from public;

revoke all on function public.attribute_match_goal(uuid, uuid, uuid, text) from public;
grant execute on function public.attribute_match_goal(uuid, uuid, uuid, text) to authenticated;

commit;
