-- Touchline migration 002 — per-match kits
alter table matches add column if not exists home_kit text;
alter table matches add column if not exists away_kit text;
