-- Touchline match preview details and pre-match league tables.
-- Existing projects: run this file once in Supabase SQL Editor.

begin;

alter table public.matches add column if not exists match_round text;
alter table public.matches add column if not exists venue_name text;
alter table public.matches add column if not exists venue_location text;
alter table public.matches add column if not exists venue_capacity integer;
alter table public.matches add column if not exists venue_surface text;
alter table public.matches add column if not exists weather text;
alter table public.matches add column if not exists referee_name text;

alter table public.competitions drop constraint if exists competitions_type_check;
alter table public.competitions
  add constraint competitions_type_check
  check (competition_type in ('friendly', 'league', 'tournament'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'matches_venue_capacity_check'
      and conrelid = 'public.matches'::regclass
  ) then
    alter table public.matches
      add constraint matches_venue_capacity_check
      check (venue_capacity is null or venue_capacity >= 0);
  end if;
end $$;

commit;
