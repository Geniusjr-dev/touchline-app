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
