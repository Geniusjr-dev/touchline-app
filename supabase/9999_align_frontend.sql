-- Touchline: align database with the organizations frontend.
-- Safe to run after your organizations schema. Idempotent.

-- 1) Columns the app reads/writes
alter table matches add column if not exists match_date date default current_date;
alter table matches add column if not exists first_half_stoppage_minutes int default 0;
alter table matches add column if not exists second_half_stoppage_minutes int default 0;
alter table matches add column if not exists extra_time_first_half_stoppage_minutes int default 0;
alter table matches add column if not exists extra_time_second_half_stoppage_minutes int default 0;

-- 2) Stoppage-time RPC (sets the current half's announced stoppage)
create or replace function public.set_match_stoppage_time(p_match_id uuid, p_minutes int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period int;
  v_minutes int := greatest(0, coalesce(p_minutes, 0));
begin
  select current_period into v_period from matches where id = p_match_id;
  if v_period is null then
    raise exception 'Match not found';
  end if;
  if v_period = 1 then
    update matches set first_half_stoppage_minutes = v_minutes where id = p_match_id;
  elsif v_period = 2 then
    update matches set second_half_stoppage_minutes = v_minutes where id = p_match_id;
  elsif v_period = 3 then
    update matches set extra_time_first_half_stoppage_minutes = v_minutes where id = p_match_id;
  elsif v_period = 4 then
    update matches set extra_time_second_half_stoppage_minutes = v_minutes where id = p_match_id;
  else
    update matches set second_half_stoppage_minutes = v_minutes where id = p_match_id;
  end if;
end;
$$;

grant execute on function public.set_match_stoppage_time(uuid, int) to authenticated;

-- 3) Backfill: attach pre-organizations rows to your organization so the admin can see them.
update competitions set organization_id = (select id from organizations order by created_at limit 1) where organization_id is null;
update teams set organization_id = (select id from organizations order by created_at limit 1) where organization_id is null;
update matches set organization_id = (select id from organizations order by created_at limit 1) where organization_id is null;

-- give old matches a date so the day strip can place them
update matches set match_date = coalesce(match_date, created_at::date, current_date) where match_date is null;

-- 4) Admin-controlled match statistics
create table if not exists match_stats (
  match_id uuid primary key references matches on delete cascade,
  home jsonb not null default '{}'::jsonb,
  away jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
alter table match_stats enable row level security;
drop policy if exists "read match_stats" on match_stats;
create policy "read match_stats" on match_stats for select using (true);
drop policy if exists "write match_stats" on match_stats;
create policy "write match_stats" on match_stats for all to authenticated
  using (exists (select 1 from matches m join organization_members om on om.organization_id = m.organization_id where m.id = match_stats.match_id and om.user_id = auth.uid() and om.active))
  with check (exists (select 1 from matches m join organization_members om on om.organization_id = m.organization_id where m.id = match_stats.match_id and om.user_id = auth.uid() and om.active));

-- 5) Live updates: broadcast changes so the public updates without refreshing
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='matches') then
    alter publication supabase_realtime add table matches; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='events') then
    alter publication supabase_realtime add table events; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='match_stats') then
    alter publication supabase_realtime add table match_stats; end if;
end $$;
