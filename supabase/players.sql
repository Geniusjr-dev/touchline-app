-- Run this in Supabase SQL Editor to add player squads.
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams on delete cascade,
  name text not null,
  number int,
  position text,
  created_at timestamptz default now()
);
alter table players enable row level security;
drop policy if exists "read players" on players;
drop policy if exists "write players" on players;
create policy "read players" on players for select using (true);
create policy "write players" on players for all using (auth.uid() is not null) with check (auth.uid() is not null);
