-- Touchline migration 021
-- Allows an active match to switch safely into completed-match recording.

begin;

create or replace function public.enable_retrospective_recording(p_match_id uuid)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_elapsed integer;
begin
  if not public.can_score_match(p_match_id) then
    raise exception 'You are not assigned to score this match';
  end if;

  select * into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Match not found';
  end if;
  if v_match.status not in ('live', 'ht') then
    raise exception 'Only a live or half-time match can switch to completed-match recording';
  end if;

  v_elapsed := coalesce(v_match.clock_elapsed_seconds, 0);
  if v_match.clock_started_at is not null then
    v_elapsed := v_elapsed
      + greatest(0, floor(extract(epoch from (clock_timestamp() - v_match.clock_started_at)))::integer);
  end if;

  update public.matches
  set operation_mode = 'retrospective',
      clock_elapsed_seconds = v_elapsed,
      clock_started_at = null
  where id = p_match_id
  returning * into v_match;

  insert into public.audit_logs (organization_id, match_id, actor_id, action, details)
  values (
    v_match.organization_id,
    p_match_id,
    auth.uid(),
    'match.retrospective.enabled',
    jsonb_build_object('status', v_match.status, 'period', v_match.current_period)
  );

  return v_match;
end;
$$;

revoke all on function public.enable_retrospective_recording(uuid) from public;
grant execute on function public.enable_retrospective_recording(uuid) to authenticated;

commit;
