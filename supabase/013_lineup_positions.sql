begin;

alter table public.match_lineups
  add column if not exists slot_index integer;

update public.match_lineups
set slot_index = greatest(0, least(10, sort_order - 1))
where role = 'starter'
  and slot_index is null;

alter table public.match_lineups
  drop constraint if exists match_lineups_slot_index_check;

alter table public.match_lineups
  add constraint match_lineups_slot_index_check
  check (
    (role = 'starter' and slot_index is not null and slot_index between 0 and 10)
    or (role = 'substitute' and slot_index is null)
  );

create unique index if not exists match_lineups_match_team_slot_idx
  on public.match_lineups(match_id, team_id, slot_index)
  where role = 'starter';

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

  if cardinality(v_starters) > 11 then
    raise exception 'A team cannot have more than 11 starters';
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

revoke all on function public.save_match_lineup_positions(uuid, uuid, text, uuid[], integer[], uuid[]) from public;
grant execute on function public.save_match_lineup_positions(uuid, uuid, text, uuid[], integer[], uuid[]) to authenticated;

create or replace function public.save_match_lineup(
  p_match_id uuid,
  p_team_id uuid,
  p_formation text,
  p_starters uuid[],
  p_substitutes uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_starters uuid[] := coalesce(p_starters, array[]::uuid[]);
  v_slots integer[];
begin
  select coalesce(array_agg(slot_number - 1 order by slot_number), array[]::integer[])
  into v_slots
  from generate_series(1, cardinality(v_starters)) as positions(slot_number);

  perform public.save_match_lineup_positions(
    p_match_id,
    p_team_id,
    p_formation,
    v_starters,
    v_slots,
    p_substitutes
  );
end;
$$;

revoke all on function public.save_match_lineup(uuid, uuid, text, uuid[], uuid[]) from public;
grant execute on function public.save_match_lineup(uuid, uuid, text, uuid[], uuid[]) to authenticated;

commit;
