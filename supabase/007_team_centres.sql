begin;

-- Public team identity and coach profile managed from the Touchline admin board.
alter table public.teams add column if not exists country text not null default 'Ghana';
alter table public.teams add column if not exists logo_url text;
alter table public.teams add column if not exists coach_name text;
alter table public.teams add column if not exists coach_country text;
alter table public.teams add column if not exists coach_date_of_birth date;
alter table public.teams add column if not exists coach_photo_url text;

-- Squad fields required by the public Squad tab.
alter table public.players add column if not exists country text not null default 'Ghana';
alter table public.players add column if not exists date_of_birth date;
alter table public.players add column if not exists photo_url text;

create table if not exists public.team_trophies (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  season text,
  won_on date,
  image_url text,
  created_at timestamptz not null default now()
);

create index if not exists team_trophies_team_idx on public.team_trophies(team_id, won_on desc, created_at desc);

alter table public.team_trophies enable row level security;

drop policy if exists "public read team trophies" on public.team_trophies;
create policy "public read team trophies"
  on public.team_trophies for select
  using (true);

drop policy if exists "organization admins create team trophies" on public.team_trophies;
create policy "organization admins create team trophies"
  on public.team_trophies for insert
  to authenticated
  with check (
    exists (
      select 1 from public.teams t
      where t.id = team_id and public.is_org_admin(t.organization_id)
    )
  );

drop policy if exists "organization admins update team trophies" on public.team_trophies;
create policy "organization admins update team trophies"
  on public.team_trophies for update
  to authenticated
  using (
    exists (
      select 1 from public.teams t
      where t.id = team_id and public.is_org_admin(t.organization_id)
    )
  )
  with check (
    exists (
      select 1 from public.teams t
      where t.id = team_id and public.is_org_admin(t.organization_id)
    )
  );

drop policy if exists "organization admins delete team trophies" on public.team_trophies;
create policy "organization admins delete team trophies"
  on public.team_trophies for delete
  to authenticated
  using (
    exists (
      select 1 from public.teams t
      where t.id = team_id and public.is_org_admin(t.organization_id)
    )
  );

grant select on table public.team_trophies to anon, authenticated;
grant insert, update, delete on table public.team_trophies to authenticated;

-- Public media bucket for team crests, coach/player portraits and trophy images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'team-media',
  'team-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public read team media" on storage.objects;
create policy "public read team media"
  on storage.objects for select
  using (bucket_id = 'team-media');

drop policy if exists "organization admins upload team media" on storage.objects;
create policy "organization admins upload team media"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'team-media' and public.is_any_org_admin());

drop policy if exists "organization admins update team media" on storage.objects;
create policy "organization admins update team media"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'team-media' and public.is_any_org_admin())
  with check (bucket_id = 'team-media' and public.is_any_org_admin());

drop policy if exists "organization admins delete team media" on storage.objects;
create policy "organization admins delete team media"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'team-media' and public.is_any_org_admin());

-- Team-centre screens update immediately when an administrator changes public data.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['teams', 'players', 'team_trophies'] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;

commit;
