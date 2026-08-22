begin;

alter table public.players
  add column if not exists display_name text;

update public.players
set display_name = null
where display_name is not null
  and trim(display_name) = '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'players_display_name_length_check'
      and conrelid = 'public.players'::regclass
  ) then
    alter table public.players
      add constraint players_display_name_length_check
      check (
        display_name is null
        or char_length(trim(display_name)) between 1 and 24
      );
  end if;
end $$;

comment on column public.players.display_name is
  'Short player name shown only in compact public lineup displays.';

commit;
