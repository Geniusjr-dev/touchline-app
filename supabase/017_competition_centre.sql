-- Touchline Competition Centre identity fields.
-- Run this file once in Supabase SQL Editor.

begin;

alter table public.competitions
  add column if not exists country text,
  add column if not exists logo_url text,
  add column if not exists theme_color text;

update public.competitions
set country = 'Ghana'
where country is null or btrim(country) = '';

update public.competitions
set theme_color = '#4B125F'
where theme_color is null or theme_color !~ '^#[0-9A-Fa-f]{6}$';

alter table public.competitions
  alter column country set default 'Ghana',
  alter column theme_color set default '#4B125F';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'competitions_theme_color_check'
      and conrelid = 'public.competitions'::regclass
  ) then
    alter table public.competitions
      add constraint competitions_theme_color_check
      check (theme_color is null or theme_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end $$;

comment on column public.competitions.country is 'Country displayed in the public Competition Centre.';
comment on column public.competitions.logo_url is 'Public competition logo used in league lists and the Competition Centre.';
comment on column public.competitions.theme_color is 'Six-digit hexadecimal header colour for the public Competition Centre.';

commit;
