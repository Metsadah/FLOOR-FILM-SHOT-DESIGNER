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
  floors        text[],                 -- null = every floor; else e.g. {mood,write,design,shots}
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
  floors        text[],                 -- preset copied onto the member when redeemed
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
drop function if exists public.redeem_production_invite(text); -- return type changed in v0.84
create or replace function public.redeem_production_invite(invite_code text)
returns table(production_id text, name text, floors text[])
language plpgsql security definer set search_path to 'public'
as $$
#variable_conflict use_column
declare inv record; em text;
begin
  select * into inv from production_invites i where i.code = invite_code;
  if inv is null then raise exception 'invalid or revoked invite'; end if;
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select u.email into em from auth.users u where u.id = auth.uid();
  insert into production_members(production_id, user_id, email, role, floors)
    values (inv.production_id, auth.uid(), coalesce(em, ''), inv.role, inv.floors)
    on conflict (production_id, user_id) do nothing;
  return query select p.id, p.name, inv.floors from productions p where p.id = inv.production_id;
end $$;

-- ---- 4 · profiles + GDPR account deletion -----------------------------------
-- all profile fields are OPTIONAL (data minimization); the consent columns
-- record which privacy-policy version the user accepted, and when
create table if not exists profiles (
  user_id             uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  name                text not null default '',
  address             text not null default '',
  phone               text not null default '',
  profession          text not null default '',
  privacy_version     text not null default '',
  privacy_accepted_at timestamptz,
  updated_at          timestamptz not null default now()
);
alter table profiles enable row level security;
create policy "own profile" on profiles for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- GDPR right to erasure: one call removes EVERYTHING the user owns,
-- including the auth account itself (SECURITY DEFINER reaches auth.users)
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  delete from kv where user_id = auth.uid();
  delete from productions where owner = auth.uid();          -- cascades docs/members/invites
  delete from production_members where user_id = auth.uid(); -- memberships in others' productions
  delete from shares where owner = auth.uid();               -- cascades share_comments
  delete from storage.objects where bucket_id = 'shares' and owner = auth.uid();
  delete from profiles where user_id = auth.uid();
  delete from auth.users where id = auth.uid();
end $$;
revoke execute on function public.delete_my_account() from anon;
revoke execute on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

-- ---- 5 · auth settings (dashboard, not SQL) ---------------------------------
-- Authentication → URL Configuration → Site URL = where you host the app
-- (magic links redirect there). Optionally set up custom SMTP for branded
-- login mails (Authentication → Emails).

-- ---- 6 · billing (hosted edition only, optional) ----------------------------
-- One row per user, written ONLY by the billing-webhook edge function with the
-- service role. Users may read their own row; there are deliberately no
-- insert/update/delete policies, so nobody can upgrade themselves.
-- Deploy supabase/functions/billing-webhook and follow BILLING.md.
create table if not exists public.subscriptions (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  plan               text not null default 'free' check (plan in ('free','pro','studio')),
  status             text not null default 'active',
  provider           text not null default '',
  customer_id        text not null default '',
  subscription_id    text not null default '',
  current_period_end timestamptz,
  update_url         text not null default '',
  cancel_url         text not null default '',
  updated_at         timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
drop policy if exists "own subscription readable" on public.subscriptions;
create policy "own subscription readable" on public.subscriptions
  for select using (auth.uid() = user_id);
grant select on public.subscriptions to authenticated;

-- ---- upgrade note (existing installs) ----------------------------------------
-- Run these once on a database created before v0.84:
--   alter table production_members add column if not exists floors text[];
--   alter table production_invites add column if not exists floors text[];
--   (then re-run the redeem_production_invite function above)

-- ---- 6 · plans v2 (v0.87): trial, promo codes, collaborator seats -----------
alter table public.subscriptions add column if not exists note text not null default '';
create table if not exists public.promo_codes (
  code        text primary key,
  days        int  not null default 90,
  plan        text not null default 'pro',
  uses_left   int  not null default 1,
  expires_at  timestamptz,
  note        text not null default '',
  created_at  timestamptz not null default now()
);
alter table public.promo_codes enable row level security; -- only the functions below touch it
create or replace function public.plan_live(uid uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$ select exists(select 1 from subscriptions s where s.user_id = uid
  and (s.status in ('active','past_due')
       or (s.status in ('canceled','trial','promo') and s.current_period_end is not null and s.current_period_end > now()))) $$;
create or replace function public.start_trial(days int default 14)
returns table(plan text, status text, current_period_end timestamptz)
language plpgsql security definer set search_path to 'public'
as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  insert into subscriptions(user_id, plan, status, provider, current_period_end, note)
    values (auth.uid(), 'pro', 'trial', 'trial', now() + make_interval(days => greatest(1, least(days, 60))), 'trial')
    on conflict (user_id) do nothing;
  return query select s.plan, s.status, s.current_period_end from subscriptions s where s.user_id = auth.uid();
end $$;
create or replace function public.redeem_promo(promo text)
returns table(plan text, status text, current_period_end timestamptz)
language plpgsql security definer set search_path to 'public'
as $$
#variable_conflict use_column
declare c record; base timestamptz;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select * into c from promo_codes p where upper(p.code) = upper(trim(promo));
  if c is null then raise exception 'That code is not valid'; end if;
  if c.uses_left <= 0 then raise exception 'That code has been used up'; end if;
  if c.expires_at is not null and c.expires_at < now() then raise exception 'That code has expired'; end if;
  select greatest(coalesce(s.current_period_end, now()), now()) into base from subscriptions s where s.user_id = auth.uid()
    and (s.status in ('trial','promo','canceled'));
  if base is null then base := now(); end if;
  insert into subscriptions(user_id, plan, status, provider, current_period_end, note)
    values (auth.uid(), c.plan, 'promo', 'promo', base + make_interval(days => c.days), 'code ' || c.code)
    on conflict (user_id) do update set
      plan = case when subscriptions.status in ('active','past_due') then subscriptions.plan else excluded.plan end,
      status = case when subscriptions.status in ('active','past_due') then subscriptions.status else 'promo' end,
      current_period_end = case when subscriptions.status in ('active','past_due') then subscriptions.current_period_end else excluded.current_period_end end,
      note = excluded.note, updated_at = now();
  update promo_codes set uses_left = uses_left - 1 where code = c.code;
  return query select s.plan, s.status, s.current_period_end from subscriptions s where s.user_id = auth.uid();
end $$;
create or replace function public.collaborator_count(owner_id uuid)
returns int language sql stable security definer set search_path to 'public'
as $$ select count(distinct m.user_id)::int from production_members m join productions p on p.id = m.production_id
       where p.owner = owner_id and m.user_id <> owner_id $$;
-- redeem_production_invite (v0.87): owner needs a live plan and a free seat — see the function above; replace it with:
drop function if exists public.redeem_production_invite(text);
create or replace function public.redeem_production_invite(invite_code text)
returns table(production_id text, name text, floors text[])
language plpgsql security definer set search_path to 'public'
as $$
#variable_conflict use_column
declare inv record; em text; own uuid; already boolean; seats int := 5; used int;
begin
  select * into inv from production_invites i where i.code = invite_code;
  if inv is null then raise exception 'invalid or revoked invite'; end if;
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select p.owner into own from productions p where p.id = inv.production_id;
  if own is null then raise exception 'invalid or revoked invite'; end if;
  if own <> auth.uid() then
    if not public.plan_live(own) then raise exception 'The owner of this production has no active plan right now'; end if;
    select exists(select 1 from production_members m join productions p on p.id = m.production_id where p.owner = own and m.user_id = auth.uid()) into already;
    if not already then
      used := public.collaborator_count(own);
      if used >= seats then raise exception 'This production owner has used all % collaborator seats', seats; end if;
    end if;
  end if;
  select u.email into em from auth.users u where u.id = auth.uid();
  insert into production_members(production_id, user_id, email, role, floors)
    values (inv.production_id, auth.uid(), coalesce(em, ''), inv.role, inv.floors)
    on conflict (production_id, user_id) do nothing;
  return query select p.id, p.name, inv.floors from productions p where p.id = inv.production_id;
end $$;
revoke execute on function public.redeem_production_invite(text) from public, anon;
grant execute on function public.redeem_production_invite(text) to authenticated;
revoke execute on function public.start_trial(int) from public, anon;   grant execute on function public.start_trial(int) to authenticated;
revoke execute on function public.redeem_promo(text) from public, anon; grant execute on function public.redeem_promo(text) to authenticated;
grant execute on function public.plan_live(uuid) to authenticated;
grant execute on function public.collaborator_count(uuid) to authenticated;
-- Creating codes (dashboard → SQL Editor), e.g. a 90-day launch code for 50 people:
--   insert into promo_codes(code, days, uses_left, note) values ('LAUNCH-2026', 90, 50, 'launch');


-- ============================================================ §7 · invites v2 (v0.92)
-- name + email on invites, read-only role, plan check only when billing runs — see setup/invites-v2.sql
--
-- Why: since v0.87 redeem_production_invite() demanded a live plan for the
-- production owner. With billing switched off (config.billing.provider = '')
-- nobody ever gets a subscriptions row, so EVERY co-edit link failed with
-- "no active plan" — which the app reported as "invalid or revoked".
-- Plan enforcement now only applies when the owner has a subscriptions row
-- (start_trial creates one at first sign-in whenever billing is on).
--
-- New: invites can name the person (name + email) and carry a role —
-- 'editor' (co-edit) or 'viewer' (read-only). An invitee who signs in with
-- the invited email is joined automatically (claim_email_invites), no link
-- needed. Read-only members cannot write production_docs (RLS), and only the
-- owner can change a member's role or floors.

alter table production_invites add column if not exists email text;
alter table production_invites add column if not exists name text;

drop function if exists public.redeem_production_invite(text);
create or replace function public.redeem_production_invite(invite_code text)
returns table(production_id text, name text, floors text[], role text)
language plpgsql security definer set search_path to 'public'
as $$
#variable_conflict use_column
declare inv record; em text; own uuid; already boolean; seats int := 5; used int; billed boolean;
begin
  select * into inv from production_invites i where i.code = invite_code;
  if inv is null then raise exception 'This invite does not exist any more — ask for a new link'; end if;
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select p.owner into own from productions p where p.id = inv.production_id;
  if own is null then raise exception 'This production no longer exists'; end if;
  if own <> auth.uid() then
    select exists(select 1 from subscriptions s where s.user_id = own) into billed;
    if billed and not public.plan_live(own) then raise exception 'The owner of this production has no active plan right now'; end if;
    select exists(select 1 from production_members m join productions p on p.id = m.production_id where p.owner = own and m.user_id = auth.uid()) into already;
    if not already then
      used := public.collaborator_count(own);
      if used >= seats then raise exception 'This production owner has used all % collaborator seats', seats; end if;
    end if;
  end if;
  select u.email into em from auth.users u where u.id = auth.uid();
  insert into production_members(production_id, user_id, email, role, floors)
    values (inv.production_id, auth.uid(), coalesce(em, ''), coalesce(inv.role, 'editor'), inv.floors)
    on conflict (production_id, user_id) do update set role = excluded.role, floors = excluded.floors
      where production_members.role <> 'owner';
  return query select p.id, p.name, inv.floors, coalesce(inv.role, 'editor') from productions p where p.id = inv.production_id;
end $$;
revoke execute on function public.redeem_production_invite(text) from public, anon;
grant execute on function public.redeem_production_invite(text) to authenticated;

-- invites addressed to my email are redeemed at sign-in, no link needed
create or replace function public.claim_email_invites()
returns table(production_id text, name text, floors text[], role text)
language plpgsql security definer set search_path to 'public'
as $$
#variable_conflict use_column
declare em text; inv record; r record;
begin
  if auth.uid() is null then return; end if;
  select lower(u.email) into em from auth.users u where u.id = auth.uid();
  if em is null or em = '' then return; end if;
  for inv in select i.code from production_invites i where lower(i.email) = em loop
    begin
      for r in select * from public.redeem_production_invite(inv.code) loop
        production_id := r.production_id; name := r.name; floors := r.floors; role := r.role;
        return next;
      end loop;
    exception when others then null; -- seat / plan problems surface when the link itself is used
    end;
  end loop;
end $$;
revoke execute on function public.claim_email_invites() from public, anon;
grant execute on function public.claim_email_invites() to authenticated;

-- read-only members read the document and never write it; only the owner edits member rows
create or replace function public.is_production_editor(pid text)
returns boolean language sql stable security definer set search_path to 'public'
as $$ select exists(select 1 from production_members
                 where production_id = pid and user_id = auth.uid() and role in ('owner','editor')) $$;
grant execute on function public.is_production_editor(text) to authenticated;
drop policy if exists "docs member all" on production_docs;
drop policy if exists "docs member read" on production_docs;
drop policy if exists "docs editor write" on production_docs;
create policy "docs member read"  on production_docs for select to authenticated using (is_production_member(production_id));
create policy "docs editor write" on production_docs for all    to authenticated using (is_production_editor(production_id)) with check (is_production_editor(production_id));
drop policy if exists "productions member update" on productions;
drop policy if exists "productions editor update" on productions;
create policy "productions editor update" on productions for update to authenticated using (owner = auth.uid() or is_production_editor(id));
drop policy if exists "members self or owner update" on production_members;
drop policy if exists "members owner update" on production_members;
create policy "members owner update" on production_members for update to authenticated
  using (auth.uid() = (select p.owner from productions p where p.id = production_members.production_id))
  with check (auth.uid() = (select p.owner from productions p where p.id = production_members.production_id));
