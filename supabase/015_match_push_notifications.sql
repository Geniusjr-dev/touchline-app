-- Touchline match notification subscriptions.
-- Run once in Supabase SQL Editor before deploying the matching application files.

begin;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  expiration_time bigint,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.match_push_subscriptions (
  push_subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (push_subscription_id, match_id)
);

create index if not exists match_push_subscriptions_match_idx
  on public.match_push_subscriptions(match_id, push_subscription_id);

alter table public.push_subscriptions enable row level security;
alter table public.match_push_subscriptions enable row level security;

revoke all on table public.push_subscriptions from anon, authenticated;
revoke all on table public.match_push_subscriptions from anon, authenticated;

commit;
