begin;

alter table public.matches add column if not exists home_kit_color text;
alter table public.matches add column if not exists away_kit_color text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'matches_home_kit_color_check') then
    alter table public.matches add constraint matches_home_kit_color_check
      check (home_kit_color is null or home_kit_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'matches_away_kit_color_check') then
    alter table public.matches add constraint matches_away_kit_color_check
      check (away_kit_color is null or away_kit_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end $$;

create or replace function public.kit_colours_are_distinct(p_home text, p_away text)
returns boolean
language plpgsql
immutable
strict
set search_path = public
as $$
declare
  v_home bytea;
  v_away bytea;
  v_red integer;
  v_green integer;
  v_blue integer;
begin
  if p_home !~ '^#[0-9A-Fa-f]{6}$' or p_away !~ '^#[0-9A-Fa-f]{6}$' then
    return false;
  end if;

  v_home := decode(substring(p_home from 2), 'hex');
  v_away := decode(substring(p_away from 2), 'hex');
  v_red := get_byte(v_home, 0) - get_byte(v_away, 0);
  v_green := get_byte(v_home, 1) - get_byte(v_away, 1);
  v_blue := get_byte(v_home, 2) - get_byte(v_away, 2);

  return v_red * v_red + v_green * v_green + v_blue * v_blue >= 6400;
end;
$$;

with team_colours as (
  select
    m.id,
    case when h.color ~ '^#[0-9A-Fa-f]{6}$' then upper(h.color) else '#18A558' end as home_colour,
    case when a.color ~ '^#[0-9A-Fa-f]{6}$' then upper(a.color) else '#2563EB' end as away_colour
  from public.matches m
  left join public.teams h on h.id = m.home_id
  left join public.teams a on a.id = m.away_id
)
update public.matches m
set
  home_kit_color = coalesce(m.home_kit_color, c.home_colour),
  away_kit_color = coalesce(
    m.away_kit_color,
    case
      when public.kit_colours_are_distinct(c.home_colour, c.away_colour) then c.away_colour
      when public.kit_colours_are_distinct(c.home_colour, '#FFFFFF') then '#FFFFFF'
      else '#111111'
    end
  )
from team_colours c
where c.id = m.id;

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
      away_kit_color = v_away
  where id = p_match_id
  returning * into v_match;

  insert into public.audit_logs (organization_id, match_id, actor_id, action, details)
  values (
    v_match.organization_id,
    p_match_id,
    auth.uid(),
    'match.kits',
    jsonb_build_object('home', v_home, 'away', v_away)
  );

  return public.transition_match_status(p_match_id, 'live');
end;
$$;

revoke all on function public.kit_colours_are_distinct(text, text) from public;
grant execute on function public.kit_colours_are_distinct(text, text) to anon, authenticated;
revoke all on function public.start_match_with_kits(uuid, text, text) from public;
grant execute on function public.start_match_with_kits(uuid, text, text) to authenticated;

commit;
