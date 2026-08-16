-- Touchline migration 0003 - competition setup, manual override, pause, stoppage.
-- Run in Supabase SQL Editor.

alter table competitions add column if not exists num_teams int;
alter table competitions add column if not exists num_groups int;

alter table matches add column if not exists score_home_manual int;
alter table matches add column if not exists score_away_manual int;
alter table matches add column if not exists stoppage_seconds int default 0;
