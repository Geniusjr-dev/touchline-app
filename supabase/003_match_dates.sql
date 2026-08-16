-- Touchline Milestone 3: real fixture dates for the home date carousel.
-- Existing Touchline projects: run this file once in Supabase -> SQL Editor.

begin;

alter table public.matches add column if not exists match_date date;

-- Existing fixtures had no date, so keep them visible by assigning them to the
-- date on which this migration is run.
update public.matches
set match_date = current_date
where match_date is null;

alter table public.matches alter column match_date set default current_date;
alter table public.matches alter column match_date set not null;

create index if not exists matches_date_kickoff_idx
  on public.matches(match_date, kickoff, created_at);

commit;
