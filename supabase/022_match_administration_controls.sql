-- Touchline migration 022
-- Administrator-only reset, awarded result, cancellation and postponement controls.

begin;

alter table public.matches
  add column if not exists decision_reason text,
  add column if not exists decision_at timestamptz,
  add column if not exists decision_by uuid references public.profiles(id) on delete set null,
  add column if not exists awarded_side text;

alter table public.matches drop constraint if exists matches_status_check;
alter table public.matches
  add constraint matches_status_check
  check (status in ('scheduled', 'live', 'ht', 'et_live', 'et_ht', 'ft', 'awarded', 'cancelled', 'postponed'));

alter table public.matches drop constraint if exists matches_awarded_side_check;
alter table public.matches
  add constraint matches_awarded_side_check
  check (awarded_side is null or awarded_side in ('home', 'away'));

create or replace function public.admin_manage_match(
  p_match_id uuid,
  p_action text,
  p_reason text,
  p_winner_side text default null,
  p_home_score integer default null,
  p_away_score integer default null,
  p_new_match_date date default null,
  p_new_kickoff text default null
)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  select * into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Match not found';
  end if;
  if not public.is_org_admin(v_match.organization_id) then
    raise exception 'Only an administrator can manage this fixture';
  end if;
  if p_action not in ('reset', 'award', 'cancel', 'postpone', 'reschedule') then
    raise exception 'Unsupported match administration action';
  end if;
  if length(v_reason) < 5 then
    raise exception 'Give a short reason of at least 5 characters';
  end if;

  if p_action = 'reset' then
    if v_match.status = 'scheduled' then
      raise exception 'This match is already scheduled';
    end if;

    delete from public.events where match_id = p_match_id;
    delete from public.match_statistics where match_id = p_match_id;

    update public.matches
    set status = 'scheduled',
        operation_mode = 'live',
        home_score = 0,
        away_score = 0,
        clock_elapsed_seconds = 0,
        clock_started_at = null,
        current_period = 0,
        locked_at = null,
        reopened_at = null,
        reopened_by = null,
        reopen_reason = null,
        first_half_stoppage_minutes = 0,
        second_half_stoppage_minutes = 0,
        extra_time_first_half_stoppage_minutes = 0,
        extra_time_second_half_stoppage_minutes = 0,
        decision_reason = null,
        decision_at = null,
        decision_by = null,
        awarded_side = null
    where id = p_match_id
    returning * into v_match;

  elsif p_action = 'award' then
    if p_winner_side not in ('home', 'away') then
      raise exception 'Choose the team receiving the awarded win';
    end if;
    if p_home_score is null or p_away_score is null or p_home_score < 0 or p_away_score < 0 then
      raise exception 'Enter a valid awarded score';
    end if;
    if p_winner_side = 'home' and p_home_score <= p_away_score then
      raise exception 'The home team must have the higher awarded score';
    end if;
    if p_winner_side = 'away' and p_away_score <= p_home_score then
      raise exception 'The away team must have the higher awarded score';
    end if;

    update public.matches
    set status = 'awarded',
        home_score = p_home_score,
        away_score = p_away_score,
        clock_started_at = null,
        locked_at = clock_timestamp(),
        decision_reason = v_reason,
        decision_at = clock_timestamp(),
        decision_by = auth.uid(),
        awarded_side = p_winner_side
    where id = p_match_id
    returning * into v_match;

  elsif p_action = 'cancel' then
    update public.matches
    set status = 'cancelled',
        clock_started_at = null,
        locked_at = clock_timestamp(),
        decision_reason = v_reason,
        decision_at = clock_timestamp(),
        decision_by = auth.uid(),
        awarded_side = null
    where id = p_match_id
    returning * into v_match;

  elsif p_action = 'postpone' then
    if v_match.status in ('ft', 'awarded') then
      raise exception 'A completed result cannot be postponed';
    end if;

    update public.matches
    set status = 'postponed',
        match_date = coalesce(p_new_match_date, match_date),
        kickoff = coalesce(nullif(trim(coalesce(p_new_kickoff, '')), ''), kickoff),
        clock_started_at = null,
        locked_at = null,
        decision_reason = v_reason,
        decision_at = clock_timestamp(),
        decision_by = auth.uid(),
        awarded_side = null
    where id = p_match_id
    returning * into v_match;

  else
    if v_match.status not in ('postponed', 'cancelled') then
      raise exception 'Only a postponed or cancelled fixture can be restored';
    end if;

    delete from public.events where match_id = p_match_id;
    delete from public.match_statistics where match_id = p_match_id;

    update public.matches
    set status = 'scheduled',
        operation_mode = 'live',
        home_score = 0,
        away_score = 0,
        match_date = coalesce(p_new_match_date, match_date),
        kickoff = coalesce(nullif(trim(coalesce(p_new_kickoff, '')), ''), kickoff),
        clock_elapsed_seconds = 0,
        clock_started_at = null,
        current_period = 0,
        locked_at = null,
        reopened_at = null,
        reopened_by = null,
        reopen_reason = null,
        first_half_stoppage_minutes = 0,
        second_half_stoppage_minutes = 0,
        extra_time_first_half_stoppage_minutes = 0,
        extra_time_second_half_stoppage_minutes = 0,
        decision_reason = null,
        decision_at = null,
        decision_by = null,
        awarded_side = null
    where id = p_match_id
    returning * into v_match;
  end if;

  insert into public.audit_logs (organization_id, match_id, actor_id, action, details)
  values (
    v_match.organization_id,
    p_match_id,
    auth.uid(),
    'match.admin.' || p_action,
    jsonb_build_object(
      'reason', v_reason,
      'status', v_match.status,
      'winner_side', p_winner_side,
      'home_score', p_home_score,
      'away_score', p_away_score,
      'new_match_date', p_new_match_date,
      'new_kickoff', p_new_kickoff
    )
  );

  return v_match;
end;
$$;

revoke all on function public.admin_manage_match(uuid, text, text, text, integer, integer, date, text) from public;
grant execute on function public.admin_manage_match(uuid, text, text, text, integer, integer, date, text) to authenticated;

commit;
