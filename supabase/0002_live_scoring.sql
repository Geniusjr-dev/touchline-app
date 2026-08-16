-- Touchline migration 0002 — live clock, atomic goals, FT lock, audit.
-- Run in Supabase → SQL Editor.

-- matches: clock + period + lock + match details
alter table matches add column if not exists elapsed_seconds int default 0;
alter table matches add column if not exists clock_running boolean default false;
alter table matches add column if not exists current_period text default 'pre';
alter table matches add column if not exists locked_at timestamptz;
alter table matches add column if not exists reopened_at timestamptz;
alter table matches add column if not exists reopened_by uuid;
alter table matches add column if not exists referee text;
alter table matches add column if not exists venue text;

-- events: attribution snapshot + accuracy + running score
alter table events add column if not exists player_id uuid references players on delete set null;
alter table events add column if not exists elapsed_seconds int;
alter table events add column if not exists score_home_after int;
alter table events add column if not exists score_away_after int;
alter table events add column if not exists is_penalty boolean default false;
alter table events add column if not exists is_own_goal boolean default false;
alter table events add column if not exists recorded_by uuid;

-- audit log for reopen / corrections
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  match_id uuid references matches on delete set null,
  reason text,
  by uuid,
  created_at timestamptz default now()
);
alter table audit_logs enable row level security;
drop policy if exists "read audit" on audit_logs;
drop policy if exists "write audit" on audit_logs;
create policy "read audit" on audit_logs for select using (true);
create policy "write audit" on audit_logs for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Full-time lock: reject event writes on locked matches
drop policy if exists "write events" on events;
drop policy if exists "insert events" on events;
drop policy if exists "update events" on events;
drop policy if exists "delete events" on events;
create policy "insert events" on events for insert with check (
  auth.uid() is not null and exists (select 1 from matches m where m.id = match_id and m.locked_at is null)
);
create policy "update events" on events for update using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "delete events" on events for delete using (
  auth.uid() is not null and exists (select 1 from matches m where m.id = match_id and m.locked_at is null)
);

-- competition format (friendly = no table, league = full table, tournament = group table)
alter table competitions add column if not exists format text default 'tournament';
-- optional shorter display name for long team names
alter table teams add column if not exists display_name text;
