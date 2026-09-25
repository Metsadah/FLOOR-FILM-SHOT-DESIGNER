-- Floorboard · security hardening v1 (v0.95) — run once in Supabase → SQL Editor,
-- AFTER setup/invites-v2.sql. Idempotent. Also appended to setup/schema.sql (§8).
--
-- What this closes (found in the audit of 25 Sep 2026):
--  1. shares had a "public read" policy: anyone could list every share token
--     → every read-only snapshot. The viewer never reads that table; dropped.
--  2. share_comments were readable by anyone across ALL shares (author names,
--     texts) and anyone could insert comments for any token, real or not.
--     Reads now go through share_comments_for(token); inserts need an existing
--     share and an author of at most 80 characters.
--  3. Any signed-in user could upload any file under any name into the public
--     "shares" bucket (free public hosting). Now: JSON only, 20 MB, and only
--     <token>.json names that belong to a share you own.
--  4. Three SECURITY DEFINER helpers were callable anonymously (plan_live,
--     collaborator_count, is_production_member) — probing other accounts.
--  5. anon / authenticated held TRUNCATE, REFERENCES and TRIGGER on every table
--     (Supabase default grants). RLS does not cover TRUNCATE. Revoked.
--  6. Reserved and misleading display names (root, admin, administrator,
--     support, floorboard, system, moderator…) are refused on profiles, and
--     names are capped at 80 characters without control characters or tags.
--  7. Storage limitation (AVG/GDPR art. 5(1)(e)): read-only share links get an
--     expiry (default 180 days) and purge_expired() removes expired shares,
--     their snapshots and comments, plus orphaned snapshot files. Schedule it
--     with pg_cron when the extension is enabled (see the end of this file);
--     without pg_cron the app calls it opportunistically when an owner opens
--     the share panel.

-- 0 · shares get an expiry column first — the comment policy and RPC below refer to it
alter table shares add column if not exists expires_at timestamptz;
-- 1 · shares: no anonymous listing
drop policy if exists "shares public read" on shares;

-- 2 · comments: read per token through an RPC, insert only for a real share
drop policy if exists "comments public read" on share_comments;
drop policy if exists "comments public insert" on share_comments;
create policy "comments public insert" on share_comments for insert to anon, authenticated
  with check (exists(select 1 from shares s where s.token = share_comments.token and (s.expires_at is null or s.expires_at > now()))
              and char_length(coalesce(author, '')) <= 80 and char_length(body) between 1 and 2000);
create or replace function public.share_comments_for(t text)
returns setof share_comments language sql stable security definer set search_path to 'public'
as $$ select c.* from share_comments c join shares s on s.token = c.token
      where c.token = t and (s.expires_at is null or s.expires_at > now()) order by c.created_at $$;
revoke execute on function public.share_comments_for(text) from public;
grant execute on function public.share_comments_for(text) to anon, authenticated;

-- 3 · the public snapshot bucket: json only, 20 MB, names tied to your own share rows
update storage.buckets set file_size_limit = 20971520, allowed_mime_types = array['application/json'] where id = 'shares';
drop policy if exists "shares bucket auth write" on storage.objects;
create policy "shares bucket owner write" on storage.objects for insert to authenticated
  with check (bucket_id = 'shares' and storage.extension(name) = 'json'
              and exists(select 1 from shares s where s.token || '.json' = name and s.owner = auth.uid()));

-- 4 · helpers: signed-in only
revoke execute on function public.plan_live(uuid) from public, anon;
revoke execute on function public.collaborator_count(uuid) from public, anon;
revoke execute on function public.is_production_member(text) from public, anon;
revoke execute on function public.is_production_editor(text) from public, anon;

-- 5 · no TRUNCATE / REFERENCES / TRIGGER through the API roles
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;

-- 6 · display names: no impersonation, no junk
create or replace function public.clean_display_name(n text)
returns text language plpgsql immutable
as $$
declare v text;
begin
  v := btrim(regexp_replace(coalesce(n, ''), '[[:cntrl:]<>]', '', 'g'));
  if char_length(v) > 80 then raise exception 'Name is too long (80 characters at most)'; end if;
  if lower(regexp_replace(v, '[^a-z0-9]', '', 'gi')) in
     ('root','admin','administrator','superuser','sysadmin','system','support','helpdesk','moderator','mod','staff','owner','security','abuse','postmaster','webmaster','noreply','floorboard','floorboardsupport','floorboardteam','floorboardadmin','zoutwater','zoutwaterfilms')
  then raise exception 'That name is reserved — use your own name'; end if;
  return v;
end $$;
create or replace function public.profiles_clean_name()
returns trigger language plpgsql
as $$ begin new.name := public.clean_display_name(new.name); return new; end $$;
drop trigger if exists profiles_clean_name on profiles;
create trigger profiles_clean_name before insert or update of name on profiles
  for each row execute function public.profiles_clean_name();
-- production names: length + no control characters (anything else is the owner's business)
create or replace function public.productions_clean_name()
returns trigger language plpgsql
as $$ begin new.name := left(regexp_replace(coalesce(new.name, ''), '[[:cntrl:]]', '', 'g'), 160); return new; end $$;
drop trigger if exists productions_clean_name on productions;
create trigger productions_clean_name before insert or update of name on productions
  for each row execute function public.productions_clean_name();

-- 7 · storage limitation: share links expire, expired data is purged
update shares set expires_at = created_at + interval '180 days' where expires_at is null;
alter table shares alter column expires_at set default (now() + interval '180 days');
create or replace function public.purge_expired()
returns table(shares_removed int, files_removed int) language plpgsql security definer set search_path to 'public'
as $$
declare n1 int; n2 int;
begin
  -- expired share links (comments cascade) and their snapshot files
  with gone as (delete from shares where expires_at is not null and expires_at < now() returning token)
  select count(*) into n1 from gone;
  with orphan as (
    delete from storage.objects o where o.bucket_id = 'shares'
      and not exists(select 1 from shares s where s.token || '.json' = o.name) returning 1)
  select count(*) into n2 from orphan;
  -- invites older than a year that were never used stop being valid
  delete from production_invites where created_at < now() - interval '365 days';
  return query select coalesce(n1, 0), coalesce(n2, 0);
end $$;
revoke execute on function public.purge_expired() from public, anon;
grant execute on function public.purge_expired() to authenticated;
-- With pg_cron (Dashboard → Database → Extensions → pg_cron), run nightly:
--   select cron.schedule('floorboard-purge', '15 3 * * *', $$select public.purge_expired()$$);

-- 8 · erasure covers the Floor Scanner photos too (the old version only removed share snapshots)
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  delete from kv where user_id = auth.uid();
  delete from productions where owner = auth.uid();          -- cascades docs / members / invites
  delete from production_members where user_id = auth.uid(); -- memberships in others' productions
  delete from shares where owner = auth.uid();               -- cascades share_comments
  delete from storage.objects where bucket_id = 'shares' and owner = auth.uid();
  delete from storage.objects where bucket_id = 'scout' and (storage.foldername(name))[1] = auth.uid()::text;
  delete from subscriptions where user_id = auth.uid();
  delete from profiles where user_id = auth.uid();
  delete from auth.users where id = auth.uid();
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- 9 · a co-editor must not be able to make themselves owner (the update policy had no WITH CHECK)
create or replace function public.productions_lock_owner()
returns trigger language plpgsql
as $$ begin
  if new.owner is distinct from old.owner and auth.uid() is distinct from old.owner then
    raise exception 'Only the owner can hand over a production';
  end if;
  return new;
end $$;
drop trigger if exists productions_lock_owner on productions;
create trigger productions_lock_owner before update on productions for each row execute function public.productions_lock_owner();

-- 10 · invites: email-bound invites only for that (confirmed) address, single-use; links expire after a year
drop function if exists public.redeem_production_invite(text);
create or replace function public.redeem_production_invite(invite_code text)
returns table(production_id text, name text, floors text[], role text)
language plpgsql security definer set search_path to 'public'
as $$
#variable_conflict use_column
declare inv record; em text; confirmed timestamptz; own uuid; already boolean; seats int := 5; used int; billed boolean;
begin
  select * into inv from production_invites i where i.code = invite_code;
  if inv is null then raise exception 'This invite does not exist any more — ask for a new link'; end if;
  if inv.created_at < now() - interval '365 days' then delete from production_invites where code = inv.code; raise exception 'This invite has expired — ask for a new link'; end if;
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select lower(u.email), u.email_confirmed_at into em, confirmed from auth.users u where u.id = auth.uid();
  if inv.email is not null and inv.email <> '' then
    if lower(inv.email) <> coalesce(em, '') then raise exception 'This invite was made for % — sign in with that address', inv.email; end if;
    if confirmed is null then raise exception 'Confirm your email address first (check your inbox)'; end if;
  end if;
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
  insert into production_members(production_id, user_id, email, role, floors)
    values (inv.production_id, auth.uid(), coalesce(em, ''), coalesce(inv.role, 'editor'), inv.floors)
    on conflict (production_id, user_id) do update set role = excluded.role, floors = excluded.floors
      where production_members.role <> 'owner';
  if inv.email is not null and inv.email <> '' then delete from production_invites where code = inv.code; end if; -- single use
  return query select p.id, p.name, inv.floors, coalesce(inv.role, 'editor') from productions p where p.id = inv.production_id;
end $$;
revoke execute on function public.redeem_production_invite(text) from public, anon;
grant execute on function public.redeem_production_invite(text) to authenticated;
create or replace function public.claim_email_invites()
returns table(production_id text, name text, floors text[], role text)
language plpgsql security definer set search_path to 'public'
as $$
#variable_conflict use_column
declare em text; confirmed timestamptz; inv record; r record;
begin
  if auth.uid() is null then return; end if;
  select lower(u.email), u.email_confirmed_at into em, confirmed from auth.users u where u.id = auth.uid();
  if em is null or em = '' or confirmed is null then return; end if; -- an unconfirmed sign-up must not collect someone else's invites
  for inv in select i.code from production_invites i where lower(i.email) = em loop
    begin
      for r in select * from public.redeem_production_invite(inv.code) loop
        production_id := r.production_id; name := r.name; floors := r.floors; role := r.role;
        return next;
      end loop;
    exception when others then null;
    end;
  end loop;
end $$;
revoke execute on function public.claim_email_invites() from public, anon;
grant execute on function public.claim_email_invites() to authenticated;

-- 11 · comment authors: the same name rules as profiles, enforced where strangers write
create or replace function public.share_comments_clean()
returns trigger language plpgsql
as $$ begin new.author := left(public.clean_display_name(new.author), 80); new.body := left(regexp_replace(new.body, '[[:cntrl:]]', '', 'g'), 2000); return new; end $$;
drop trigger if exists share_comments_clean on share_comments;
create trigger share_comments_clean before insert or update on share_comments for each row execute function public.share_comments_clean();

-- 12 · trial length is not the client's to choose; a promo code counts once per account; no double-spend on uses_left
create or replace function public.start_trial(days int default 14)
returns table(plan text, status text, current_period_end timestamptz)
language plpgsql security definer set search_path to 'public'
as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  insert into subscriptions(user_id, plan, status, provider, current_period_end, note)
    values (auth.uid(), 'pro', 'trial', 'trial', now() + interval '14 days', 'trial')
    on conflict (user_id) do nothing;
  return query select s.plan, s.status, s.current_period_end from subscriptions s where s.user_id = auth.uid();
end $$;
create table if not exists promo_redemptions (
  code text not null, user_id uuid not null references auth.users(id) on delete cascade, at timestamptz not null default now(),
  primary key (code, user_id)
);
alter table promo_redemptions enable row level security;
create or replace function public.redeem_promo(promo text)
returns table(plan text, status text, current_period_end timestamptz)
language plpgsql security definer set search_path to 'public'
as $$
#variable_conflict use_column
declare c record; base timestamptz;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select * into c from promo_codes p where upper(p.code) = upper(trim(promo)) for update;
  if c is null then raise exception 'That code is not valid'; end if;
  if c.uses_left <= 0 then raise exception 'That code has been used up'; end if;
  if c.expires_at is not null and c.expires_at < now() then raise exception 'That code has expired'; end if;
  if exists(select 1 from promo_redemptions r where r.code = c.code and r.user_id = auth.uid()) then raise exception 'You already used that code'; end if;
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
  insert into promo_redemptions(code, user_id) values (c.code, auth.uid());
  return query select s.plan, s.status, s.current_period_end from subscriptions s where s.user_id = auth.uid();
end $$;

-- 13 · size ceilings on stored values (the client already downsizes; this stops a script from filling the database)
alter table kv drop constraint if exists kv_value_size;
alter table kv add constraint kv_value_size check (octet_length(value) <= 16777216) not valid;
alter table production_docs drop constraint if exists production_docs_value_size;
alter table production_docs add constraint production_docs_value_size check (octet_length(value) <= 16777216) not valid;

-- 14 · storage rows: SQL deletes may be refused on newer Supabase (the app removes files through the Storage API first) — never let that abort erasure
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path to 'public'
as $$
declare em text;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select email into em from auth.users where id = auth.uid();
  delete from kv where user_id = auth.uid();
  delete from productions where owner = auth.uid();          -- cascades docs / members / invites
  delete from production_members where user_id = auth.uid(); -- memberships in others' productions
  update productions set opened_by = '' where opened_by = coalesce(em, '~');
  delete from shares where owner = auth.uid();               -- cascades share_comments
  begin
    delete from storage.objects where bucket_id = 'shares' and owner = auth.uid();
    delete from storage.objects where bucket_id = 'scout' and (storage.foldername(name))[1] = auth.uid()::text;
  exception when others then null;
  end;
  delete from subscriptions where user_id = auth.uid();
  delete from profiles where user_id = auth.uid();
  delete from auth.users where id = auth.uid();
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
create or replace function public.purge_expired()
returns table(shares_removed int, files_removed int) language plpgsql security definer set search_path to 'public'
as $$
declare n1 int := 0; n2 int := 0;
begin
  with gone as (delete from shares where expires_at is not null and expires_at < now() returning token)
  select count(*) into n1 from gone;
  begin
    with orphan as (
      delete from storage.objects o where o.bucket_id = 'shares'
        and not exists(select 1 from shares s where s.token || '.json' = o.name) returning 1)
    select count(*) into n2 from orphan;
  exception when others then n2 := -1; -- storage refused SQL deletes: clean orphans with the Storage API instead
  end;
  delete from production_invites where created_at < now() - interval '365 days';
  return query select n1, n2;
end $$;
