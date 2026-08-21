begin;

create table if not exists public.match_lineups (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  role text not null check (role in ('starter', 'substitute')),
  formation text,
  sort_order integer not null default 0 check (sort_order between 0 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, player_id)
);

create index if not exists match_lineups_match_team_idx
  on public.match_lineups(match_id, team_id, role, sort_order);

alter table public.match_lineups enable row level security;

drop policy if exists "public read match lineups" on public.match_lineups;
create policy "public read match lineups"
  on public.match_lineups for select
  using (true);

revoke insert, update, delete on table public.match_lineups from anon, authenticated;
grant select on table public.match_lineups to anon, authenticated;

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
  v_match public.matches%rowtype;
  v_starters uuid[] := coalesce(p_starters, array[]::uuid[]);
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

  if cardinality(v_starters) > 11 then
    raise exception 'A team cannot have more than 11 starters';
  end if;

  if v_formation is not null and char_length(v_formation) > 30 then
    raise exception 'The formation is too long';
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
    sort_order
  )
  select
    p_match_id,
    p_team_id,
    selected.player_id,
    'starter',
    v_formation,
    selected.ordinality::integer
  from unnest(v_starters) with ordinality as selected(player_id, ordinality);

  insert into public.match_lineups (
    match_id,
    team_id,
    player_id,
    role,
    formation,
    sort_order
  )
  select
    p_match_id,
    p_team_id,
    selected.player_id,
    'substitute',
    v_formation,
    selected.ordinality::integer
  from unnest(v_substitutes) with ordinality as selected(player_id, ordinality);
end;
$$;

revoke all on function public.save_match_lineup(uuid, uuid, text, uuid[], uuid[]) from public;
grant execute on function public.save_match_lineup(uuid, uuid, text, uuid[], uuid[]) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'match_lineups'
  ) then
    alter publication supabase_realtime add table public.match_lineups;
  end if;
end $$;

commit;
