-- Run after importing the 2025/2026 group stage and final.
begin;

do $import$
declare
  quarterfinal_date date := '2026-01-02';
  semifinal_date date := '2026-01-03';
  final_date constant date := '2026-01-04';
  competition public.competitions%rowtype;
  edition uuid;
  club record;
  club_id uuid;
  ids jsonb := '{}';
  fixture record;
  home_team uuid;
  away_team uuid;
  existing_match uuid;
begin
  if quarterfinal_date <= date '2025-12-31'
    or quarterfinal_date > final_date
    or semifinal_date <= date '2025-12-31'
    or semifinal_date < quarterfinal_date or semifinal_date > final_date then
    raise exception 'Use the confirmed quarterfinal and semifinal dates in chronological order.';
  end if;

  select * into strict competition from public.competitions
  where id = '013f3c6e-4aa1-486f-a0f9-1d031265655e'
    and competition_type = 'tournament'
  for update;

  select id into strict edition from public.tournament_editions
  where competition_id = competition.id
    and regexp_replace(label, '[^0-9]', '', 'g') = '20252026';

  for club in
    select * from (values
      ('euphoria', 1, array['Euphoria FC', 'Euphoria']),
      ('galaxy', 1, array['Galaxy FC', 'Galaxy']),
      ('white', 1, array['White Lions', 'White Lions FC']),
      ('wailers', 2, array['Wailers FC', 'Wailers', 'Wailers Football Club']),
      ('bayern', 2, array['Bayern Munich', 'Bayern Muchen']),
      ('heroes', 2, array['Top Heroes', 'Top Heroes FC']),
      ('rex', 3, array['Rex Academy', 'Rex Academy FC', 'Rex Football Club']),
      ('young', 3, array['Young FC (BB)', 'Young FC, BB', 'Young FC BB'])
    ) as clubs(key, group_number, aliases)
  loop
    begin
      select t.id into strict club_id from public.teams t
      where t.organization_id is not distinct from competition.organization_id
        and exists (select 1 from public.tournament_edition_teams et
          where et.edition_id = edition and et.team_id = t.id)
        and lower(btrim(t.name)) in (select lower(alias) from unnest(club.aliases) as alias);
    exception when no_data_found or too_many_rows then
      raise exception 'Expected one registered Touchline team for %.', club.aliases[1];
    end;
    ids := ids || jsonb_build_object(club.key, club_id);

  end loop;

  for fixture in
    select * from (values
      (quarterfinal_date, '07:30', 'Quarterfinal', null::integer, 'white', 'young', 3, 0, 'ft', null, null, null),
      (quarterfinal_date, '09:30', 'Quarterfinal', null, 'wailers', 'euphoria', 2, 0, 'ft', null, null, null),
      (quarterfinal_date, '14:00', 'Quarterfinal', null, 'rex', 'bayern', 5, 0, 'ft', null, null, null),
      (quarterfinal_date, '16:00', 'Quarterfinal', null, 'heroes', 'galaxy', 0, 0, 'cancelled', null, null, 'Abandoned at 0-0. Both teams were disqualified. White Lions advanced directly to the final.'),
      (semifinal_date, null, 'Semifinal', null, 'rex', 'wailers', 3, 3, 'ft', 4, 2, 'Wailers FC were awarded bronze.')
    ) as fixtures(played_on, kickoff, round, group_number, home_key, away_key, hs, aws, status, hp, ap, reason)
  loop
    home_team := (ids ->> fixture.home_key)::uuid;
    away_team := (ids ->> fixture.away_key)::uuid;
    begin
      select id into strict existing_match from public.matches m
      where m.edition_id = edition and m.home_id = home_team and m.away_id = away_team
        and m.group_number is null;
    exception when no_data_found then
      existing_match := null;
    end;

    if existing_match is null then
      insert into public.matches (
        competition_id, organization_id, edition_id, group_number, home_id, away_id,
        match_date, kickoff, match_round, status, home_score, away_score,
        home_penalties, away_penalties, decision_reason, awarded_side, locked_at
      ) values (
        competition.id, competition.organization_id, edition, fixture.group_number, home_team, away_team,
        fixture.played_on, fixture.kickoff, fixture.round, fixture.status, fixture.hs, fixture.aws,
        fixture.hp, fixture.ap, fixture.reason, case when fixture.status = 'awarded' then 'away' end, now()
      );
    else
      update public.matches set
        match_date = coalesce(fixture.played_on, match_date), kickoff = coalesce(fixture.kickoff, kickoff),
        match_round = fixture.round, group_number = fixture.group_number,
        status = fixture.status, home_score = fixture.hs, away_score = fixture.aws,
        home_penalties = fixture.hp, away_penalties = fixture.ap, decision_reason = fixture.reason,
        awarded_side = case when fixture.status = 'awarded' then 'away' end,
        clock_started_at = null, locked_at = coalesce(locked_at, now()),
        operation_mode = 'live'
      where id = existing_match;
    end if;
  end loop;

  update public.tournament_editions
  set completed = true
  where id = edition;

  raise notice 'Imported four quarterfinals and one semifinal.';
end;
$import$;

commit;
