-- =============================================================
-- AdvisaStacks: Consultant Invite & Membership Schema
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- =============================================================

-- 1. MEMBERSHIPS TABLE
-- Source of truth for portal access. Every user who can access a portal
-- has a row here. Normal tradies do NOT need a row — they use billing_subscriptions.
-- Consultants need role='consultant' AND portal_access=true.

create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'consultant', 'admin')),
  portal_access boolean not null default false,
  display_name text,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One membership row per user
create unique index if not exists memberships_user_id_idx on memberships(user_id);

-- Fast lookup by role
create index if not exists memberships_role_idx on memberships(role) where portal_access = true;

-- RLS: users can read their own membership. Service role can do everything.
alter table memberships enable row level security;

create policy "Users can read own membership"
  on memberships for select
  using (auth.uid() = user_id);

create policy "Service role full access on memberships"
  on memberships for all
  using (auth.role() = 'service_role');


-- 2. CONSULTANT_INVITES TABLE
-- Tracks the invite lifecycle. An invite is created when an admin sends one.
-- It transitions: pending -> accepted (when consultant completes setup).
-- Can also be revoked by an admin.

create table if not exists consultant_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  invited_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  user_id uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- One active invite per email (pending)
create unique index if not exists consultant_invites_email_pending_idx
  on consultant_invites(email) where status = 'pending';

-- Lookup by email for checking invite status
create index if not exists consultant_invites_email_idx on consultant_invites(email);

-- RLS: only service role manages invites. No browser access needed.
alter table consultant_invites enable row level security;

create policy "Service role full access on consultant_invites"
  on consultant_invites for all
  using (auth.role() = 'service_role');


-- 3. CONSULTANT_CLIENTS TABLE (already partially exists from earlier work)
-- Stores the consultant's client data for the dashboard.
-- Kept separate from memberships — this is business data, not auth.

create table if not exists consultant_clients (
  id uuid primary key default gen_random_uuid(),
  consultant_id uuid not null references auth.users(id) on delete cascade,
  business_name text not null,
  industry text not null default 'General',
  status text not null default 'needs_setup' check (status in ('active', 'trial', 'needs_setup', 'inactive')),
  active_tools integer not null default 0,
  last_active_date date,
  usage_week integer not null default 0,
  usage_month integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists consultant_clients_consultant_idx on consultant_clients(consultant_id);

alter table consultant_clients enable row level security;

-- Consultants can read their own clients
create policy "Consultants can read own clients"
  on consultant_clients for select
  using (auth.uid() = consultant_id);

create policy "Service role full access on consultant_clients"
  on consultant_clients for all
  using (auth.role() = 'service_role');
