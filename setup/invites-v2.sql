-- Floorboard · invites v2 (v0.92) — run once in Supabase → SQL Editor.
-- Also appended to setup/schema.sql (§7) for fresh installs.
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

-- role checks: the viewer (read-only) role must be allowed by the constraints
alter table production_members drop constraint if exists production_members_role_check;
alter table production_members add constraint production_members_role_check check (role in ('owner','editor','viewer'));
alter table production_invites drop constraint if exists production_invites_role_check;
alter table production_invites add constraint production_invites_role_check check (role in ('owner','editor','viewer'));
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
