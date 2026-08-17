-- ============================================================================
-- FLOOR Studio — complete backend schema (Supabase)
-- Run ONCE in your Supabase project: SQL Editor → paste → Run.
-- Dumped from the reference deployment 2026-07-24; idempotent-ish (uses
-- IF NOT EXISTS where possible — safe to re-run on a fresh project).
--
-- Enables: cloud saves (kv), read-only share links + comments (shares,
-- share_comments + a public storage bucket), and co-editing (productions,
-- production_members, production_docs, production_invites).
-- ============================================================================

-- ---- 1 · personal cloud saves ----------------------------------------------
create table if not exists kv (
  user_id    uuid not null default auth.uid(),
  key        text not null,
  value      text not null,
  updated_at timestamptz default now(),
  primary key (user_id, key)
);
alter table kv enable row level security;
create policy "users manage their own rows" on kv for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---- 2 · read-only share links + comments ----------------------------------
create table if not exists shares (
  token      text primary key,
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title      text not null default '',
  created_at timestamptz not null default now()
);
alter table shares enable row level security;
create policy "shares owner all" on shares for all to authenticated
  using (auth.uid() = owner) with check (auth.uid() = owner);
create policy "shares public read" on shares for select using (true);

create table if not exists share_comments (
  id         uuid primary key default gen_random_uuid(),
  token      text not null references shares(token) on delete cascade,
  board_key  text not null default '',
  x          double precision not null default 0,
  y          double precision not null default 0,
  author     text not null default '',
  body       text not null,
  created_at timestamptz not null default now()
);
alter table share_comments enable row level security;
create policy "comments public read"   on share_comments for select using (true);
create policy "comments public insert" on share_comments for insert with check (true);
create policy "comments owner delete"  on share_comments for delete to authenticated
  using (exists (select 1 from shares s where s.token = share_comments.token and s.owner = auth.uid()));

-- public storage bucket for share snapshots
insert into storage.buckets (id, name, public) values ('shares', 'shares', true)
  on conflict (id) do nothing;
create policy "shares bucket auth write" on storage.objects for insert to authenticated
  with check (bucket_id = 'shares');
create policy "shares bucket owner update" on storage.objects for update to authenticated
  using (bucket_id = 'shares' and owner = auth.uid());
create policy "shares bucket owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'shares' and owner = auth.uid());

-- ---- 3 · co-editing ---------------------------------------------------------
create table if not exists productions (
  id         text primary key,
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null default '',
  opened_by  text,
  opened_at  timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists production_members (
  production_id text not null references productions(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  email         text not null default '',
  role          text not null default 'editor',
  added_at      timestamptz not null default now(),
  primary key (production_id, user_id)
);
create table if not exists production_docs (
  production_id text not null references productions(id) on delete cascade,
  key           text not null,
  value         text not null,
  updated_at    timestamptz not null default now(),
  primary key (production_id, key)
);
create table if not exists production_invites (
  code          text primary key,
  production_id text not null references productions(id) on delete cascade,
  role          text not null default 'editor',
  created_by    uuid not null default auth.uid(),
  created_at    timestamptz not null default now()
);

-- SECURITY DEFINER helper — RLS policies can't self-reference the members
-- table without infinite recursion
create or replace function public.is_production_member(pid text)
returns boolean language sql stable security definer set search_path to 'public'
as $$ select exists(select 1 from production_members
                 where production_id = pid and user_id = auth.uid()) $$;

alter table productions enable row level security;
create policy "productions owner insert" on productions for insert to authenticated
  with check (owner = auth.uid());
create policy "productions member read" on productions for select to authenticated
  using (owner = auth.uid() or is_production_member(id));
create policy "productions member update" on productions for update to authenticated
  using (owner = auth.uid() or is_production_member(id));
create policy "productions owner delete" on productions for delete to authenticated
  using (owner = auth.uid());

alter table production_members enable row level security;
-- NOTE: the owner must see members even BEFORE their own membership row
-- exists (upsert enforces SELECT on the new row) — hence the owner clause
create policy "members member read" on production_members for select to authenticated
  using (is_production_member(production_id)
     or auth.uid() = (select p.owner from productions p where p.id = production_members.production_id));
create policy "members owner insert" on production_members for insert to authenticated
  with check (auth.uid() = (select p.owner from productions p where p.id = production_members.production_id));
create policy "members self or owner update" on production_members for update to authenticated
  using (user_id = auth.uid()
     or auth.uid() = (select p.owner from productions p where p.id = production_members.production_id))
  with check (user_id = auth.uid()
     or auth.uid() = (select p.owner from productions p where p.id = production_members.production_id));
create policy "members owner or self delete" on production_members for delete to authenticated
  using (user_id = auth.uid()
     or auth.uid() = (select p.owner from productions p where p.id = production_members.production_id));

alter table production_docs enable row level security;
create policy "docs member all" on production_docs for all to authenticated
  using (is_production_member(production_id)) with check (is_production_member(production_id));

alter table production_invites enable row level security;
create policy "invites owner all" on production_invites for all to authenticated
  using (auth.uid() = (select p.owner from productions p where p.id = production_invites.production_id))
  with check (auth.uid() = (select p.owner from productions p where p.id = production_invites.production_id));

-- invite redemption (SECURITY DEFINER: the joiner can't see the invite row
-- through RLS). #variable_conflict is LOAD-BEARING — the RETURNS TABLE
-- column would otherwise shadow the insert's column name (42702).
create or replace function public.redeem_production_invite(invite_code text)
returns table(production_id text, name text)
language plpgsql security definer set search_path to 'public'
as $$
#variable_conflict use_column
declare inv record; em text;
begin
  select * into inv from production_invites i where i.code = invite_code;
  if inv is null then raise exception 'invalid or revoked invite'; end if;
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select u.email into em from auth.users u where u.id = auth.uid();
  insert into production_members(production_id, user_id, email, role)
    values (inv.production_id, auth.uid(), coalesce(em, ''), inv.role)
    on conflict (production_id, user_id) do nothing;
  return query select p.id, p.name from productions p where p.id = inv.production_id;
end $$;

-- ---- 4 · auth settings (dashboard, not SQL) ---------------------------------
-- Authentication → URL Configuration → Site URL = where you host the app
-- (magic links redirect there). Optionally set up custom SMTP for branded
-- login mails (Authentication → Emails).
