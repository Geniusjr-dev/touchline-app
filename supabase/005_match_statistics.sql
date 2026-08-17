begin;

create table if not exists public.match_statistics (
  match_id uuid primary key references public.matches(id) on delete cascade,
  home_possession smallint not null default 50,
  away_possession smallint not null default 50,
  home_total_shots integer not null default 0,
  away_total_shots integer not null default 0,
  home_shots_on_target integer not null default 0,
  away_shots_on_target integer not null default 0,
  home_corners integer not null default 0,
  away_corners integer not null default 0,
  home_fouls integer not null default 0,
  away_fouls integer not null default 0,
  home_offsides integer not null default 0,
  away_offsides integer not null default 0,
  home_yellow_cards integer not null default 0,
  away_yellow_cards integer not null default 0,
  home_red_cards integer not null default 0,
  away_red_cards integer not null default 0,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint match_statistics_possession_range check (
    home_possession between 0 and 100 and away_possession between 0 and 100
  ),
  constraint match_statistics_possession_total check (
    home_possession + away_possession = 100
  ),
  constraint match_statistics_non_negative check (
    least(
      home_total_shots, away_total_shots,
      home_shots_on_target, away_shots_on_target,
      home_corners, away_corners,
      home_fouls, away_fouls,
      home_offsides, away_offsides,
      home_yellow_cards, away_yellow_cards,
      home_red_cards, away_red_cards
    ) >= 0
  )
);

alter table public.match_statistics enable row level security;

drop policy if exists "public read match statistics" on public.match_statistics;
create policy "public read match statistics"
  on public.match_statistics for select using (true);

create or replace function public.save_match_statistics(
  p_match_id uuid,
  p_home_possession integer,
  p_away_possession integer,
  p_home_total_shots integer,
  p_away_total_shots integer,
  p_home_shots_on_target integer,
  p_away_shots_on_target integer,
  p_home_corners integer,
  p_away_corners integer,
  p_home_fouls integer,
  p_away_fouls integer,
  p_home_offsides integer,
  p_away_offsides integer,
  p_home_yellow_cards integer,
  p_away_yellow_cards integer,
  p_home_red_cards integer,
  p_away_red_cards integer
)
returns public.match_statistics
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stats public.match_statistics%rowtype;
begin
  if not public.can_score_match(p_match_id) then
    raise exception 'You are not allowed to update statistics for this match';
  end if;

  if p_home_possession not between 0 and 100
     or p_away_possession not between 0 and 100
     or p_home_possession + p_away_possession <> 100 then
    raise exception 'Possession must be between 0 and 100 and total 100 percent';
  end if;

  if least(
    p_home_total_shots, p_away_total_shots,
    p_home_shots_on_target, p_away_shots_on_target,
    p_home_corners, p_away_corners,
    p_home_fouls, p_away_fouls,
    p_home_offsides, p_away_offsides,
    p_home_yellow_cards, p_away_yellow_cards,
    p_home_red_cards, p_away_red_cards
  ) < 0 then
    raise exception 'Statistics cannot be negative';
  end if;

  insert into public.match_statistics (
    match_id,
    home_possession, away_possession,
    home_total_shots, away_total_shots,
    home_shots_on_target, away_shots_on_target,
    home_corners, away_corners,
    home_fouls, away_fouls,
    home_offsides, away_offsides,
    home_yellow_cards, away_yellow_cards,
    home_red_cards, away_red_cards,
    updated_by, updated_at
  ) values (
    p_match_id,
    p_home_possession, p_away_possession,
    p_home_total_shots, p_away_total_shots,
    p_home_shots_on_target, p_away_shots_on_target,
    p_home_corners, p_away_corners,
    p_home_fouls, p_away_fouls,
    p_home_offsides, p_away_offsides,
    p_home_yellow_cards, p_away_yellow_cards,
    p_home_red_cards, p_away_red_cards,
    auth.uid(), now()
  )
  on conflict (match_id) do update set
    home_possession = excluded.home_possession,
    away_possession = excluded.away_possession,
    home_total_shots = excluded.home_total_shots,
    away_total_shots = excluded.away_total_shots,
    home_shots_on_target = excluded.home_shots_on_target,
    away_shots_on_target = excluded.away_shots_on_target,
    home_corners = excluded.home_corners,
    away_corners = excluded.away_corners,
    home_fouls = excluded.home_fouls,
    away_fouls = excluded.away_fouls,
    home_offsides = excluded.home_offsides,
    away_offsides = excluded.away_offsides,
    home_yellow_cards = excluded.home_yellow_cards,
    away_yellow_cards = excluded.away_yellow_cards,
    home_red_cards = excluded.home_red_cards,
    away_red_cards = excluded.away_red_cards,
    updated_by = auth.uid(),
    updated_at = now()
  returning * into v_stats;

  return v_stats;
end;
$$;

revoke all on function public.save_match_statistics(
  uuid, integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, integer, integer, integer, integer, integer, integer
) from public;

grant execute on function public.save_match_statistics(
  uuid, integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, integer, integer, integer, integer, integer, integer
) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'match_statistics'
  ) then
    alter publication supabase_realtime add table public.match_statistics;
  end if;
end $$;

commit;
