-- =============================================================
-- AdvisaStacks – Email-based two-factor authentication tables
-- Run this in Supabase SQL Editor (after supabase-billing.sql)
-- =============================================================

-- Stores short-lived 6-digit codes sent to the user's email on login.
create table if not exists public.login_verification_codes (
  id          uuid        default gen_random_uuid() primary key,
  user_id     uuid        references auth.users(id) on delete cascade not null,
  code        text        not null,
  expires_at  timestamptz not null,
  used        boolean     default false not null,
  created_at  timestamptz default now() not null
);

-- Tracks which sessions have been verified with a valid email code.
create table if not exists public.login_verifications (
  id          uuid        default gen_random_uuid() primary key,
  user_id     uuid        references auth.users(id) on delete cascade not null,
  session_id  text        not null,
  verified_at timestamptz default now() not null,
  unique(user_id, session_id)
);

-- Tracks failed and successful verification attempts for rate limiting.
create table if not exists public.login_verification_attempts (
  id          uuid        default gen_random_uuid() primary key,
  user_id     uuid        references auth.users(id) on delete cascade not null,
  success     boolean     default false not null,
  attempted_at timestamptz default now() not null
);

-- RLS enabled with NO client-side policies — only the service-role key
-- (used by API routes) can read/write these tables.
alter table public.login_verification_codes enable row level security;
alter table public.login_verifications enable row level security;
alter table public.login_verification_attempts enable row level security;

-- Indexes for fast lookups
create index if not exists idx_login_codes_lookup
  on public.login_verification_codes(user_id, used, expires_at);

create index if not exists idx_login_verifications_lookup
  on public.login_verifications(user_id, session_id);

create index if not exists idx_login_attempts_lookup
  on public.login_verification_attempts(user_id, success, attempted_at);
