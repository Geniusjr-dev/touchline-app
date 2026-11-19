begin;

alter table public.matches
  add column if not exists home_penalties smallint,
  add column if not exists away_penalties smallint;

alter table public.matches drop constraint if exists matches_penalty_pair_check;
alter table public.matches add constraint matches_penalty_pair_check check (
  (home_penalties is null and away_penalties is null) or
  (home_penalties is not null and away_penalties is not null
    and home_penalties between 0 and 99 and away_penalties between 0 and 99
    and home_penalties <> away_penalties)
);

alter table public.tournament_editions
  add column if not exists knockout_slots integer;
alter table public.tournament_editions drop constraint if exists tournament_editions_team_count_check;
alter table public.tournament_editions add constraint tournament_editions_team_count_check
  check (team_count >= 4 and (knockout_slots is null or knockout_slots between 2 and team_count));
alter table public.tournament_edition_teams drop constraint if exists tournament_edition_teams_group_number_check;
alter table public.tournament_edition_teams add constraint tournament_edition_teams_group_number_check check (group_number >= 1);

update public.matches set home_penalties = 2, away_penalties = 4
where competition_id = '013f3c6e-4aa1-486f-a0f9-1d031265655e'
  and match_date = '2025-04-19'
  and home_score = 2 and away_score = 2
  and match_round ilike '%Puma won 4-2 on penalties%'
  and home_penalties is null and away_penalties is null;

commit;
