begin;

-- Let signed-in match scorers write the same row that the public match centre reads.
-- This removes the extra RPC dependency and makes INSERT and UPDATE both work.
alter table public.match_statistics enable row level security;

drop policy if exists "authorized scorers insert match statistics" on public.match_statistics;
create policy "authorized scorers insert match statistics"
  on public.match_statistics
  for insert
  to authenticated
  with check (public.can_score_match(match_id));

drop policy if exists "authorized scorers update match statistics" on public.match_statistics;
create policy "authorized scorers update match statistics"
  on public.match_statistics
  for update
  to authenticated
  using (public.can_score_match(match_id))
  with check (public.can_score_match(match_id));

grant select on table public.match_statistics to anon, authenticated;
grant insert, update on table public.match_statistics to authenticated;

-- Include the complete updated row in Realtime events so the public view refreshes reliably.
alter table public.match_statistics replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'match_statistics'
  ) then
    alter publication supabase_realtime add table public.match_statistics;
  end if;
end $$;

commit;
