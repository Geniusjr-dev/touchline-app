-- Touchline schema. Run this in Supabase → SQL Editor.

create extension if not exists pgcrypto;

-- Roles for people you invite (admin can manage everything; scorer can score matches)
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  role text not null default 'scorer',   -- 'admin' | 'scorer'
  created_at timestamptz default now()
);

create table if not exists competitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sub text,
  created_at timestamptz default now()
);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short text not null,
  color text not null default '#18A558',
  created_at timestamptz default now()
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid references competitions on delete set null,
  home_id uuid references teams on delete set null,
  away_id uuid references teams on delete set null,
  status text not null default 'scheduled',   -- scheduled|live|ht|ft
  kickoff text,
  clock_base int default 0,
  clock_started_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches on delete cascade,
  minute int,
  type text not null,        -- goal|yellow|red|sub|miss
  side text not null,        -- home|away
  player text,
  assist text,
  created_at timestamptz default now()
);

-- Auto-create a profile row when a user signs up
create or replace function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, email, role) values (new.id, new.email, 'scorer')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security: everyone can read; only signed-in users can write
alter table competitions enable row level security;
alter table teams enable row level security;
alter table matches enable row level security;
alter table events enable row level security;
alter table profiles enable row level security;

create policy "read competitions" on competitions for select using (true);
create policy "read teams" on teams for select using (true);
create policy "read matches" on matches for select using (true);
create policy "read events" on events for select using (true);

create policy "write competitions" on competitions for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "write teams" on teams for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "write matches" on matches for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "write events" on events for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "read own profile" on profiles for select using (auth.uid() = id);
create policy "update own profile" on profiles for update using (auth.uid() = id);

-- Realtime for live updates
alter publication supabase_realtime add table matches;
alter publication supabase_realtime add table events;
