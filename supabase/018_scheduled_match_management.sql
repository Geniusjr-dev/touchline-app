-- Touchline scheduled-match management and one-time test-match cleanup.
-- This keeps every scheduled match and removes only matches that have already started.

begin;

drop policy if exists "organization admins update scheduled matches" on public.matches;
create policy "organization admins update scheduled matches"
  on public.matches
  for update
  using (
    public.is_org_admin(organization_id)
    and status = 'scheduled'
  )
  with check (
    public.is_org_admin(organization_id)
    and status = 'scheduled'
  );

delete from public.matches
where status <> 'scheduled';

commit;
