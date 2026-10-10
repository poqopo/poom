alter table public.profiles
  alter column display_name drop not null,
  add column email text,
  add column onboarding_completed boolean not null default false,
  add column updated_at timestamptz not null default now();

update public.profiles as profile
set email = auth_user.email
from auth.users as auth_user
where auth_user.id = profile.id
  and profile.email is distinct from auth_user.email;

insert into public.profiles (id, email, display_name, onboarding_completed)
select auth_user.id, auth_user.email, null, false
from auth.users as auth_user
left join public.profiles as profile on profile.id = auth_user.id
where profile.id is null
on conflict (id) do nothing;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function public.handle_new_auth_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, onboarding_completed)
  values (new.id, new.email, null, false)
  on conflict (id) do update
    set email = excluded.email,
        updated_at = pg_catalog.now();

  return new;
end;
$$;

revoke all on function public.handle_new_auth_profile() from public, anon, authenticated;

create or replace function private.sync_auth_user_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set email = new.email,
      updated_at = pg_catalog.now()
  where id = new.id;

  return new;
end;
$$;

revoke all on function private.sync_auth_user_profile_email() from public, anon, authenticated;

drop trigger if exists on_auth_user_email_updated_profile on auth.users;
create trigger on_auth_user_email_updated_profile
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function private.sync_auth_user_profile_email();

create or replace function private.complete_profile_onboarding(p_display_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  auth_email text;
  normalized_display_name text;
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  normalized_display_name := pg_catalog.btrim(coalesce(p_display_name, ''), E' \t\n\r\f\v');
  if pg_catalog.char_length(normalized_display_name) < 2
    or pg_catalog.char_length(normalized_display_name) > 12
    or normalized_display_name !~ '^[가-힣A-Za-z0-9]+$' then
    raise exception 'invalid_display_name' using errcode = '22023';
  end if;

  select auth_user.email
  into auth_email
  from auth.users as auth_user
  where auth_user.id = current_user_id;

  if not found then
    raise exception 'auth_user_not_found' using errcode = '28000';
  end if;

  insert into public.profiles (id, email, display_name, onboarding_completed)
  values (current_user_id, auth_email, null, false)
  on conflict (id) do nothing;

  update public.profiles
  set display_name = normalized_display_name,
      email = auth_email,
      onboarding_completed = true,
      updated_at = pg_catalog.now()
  where id = current_user_id
    and onboarding_completed = false;

  if not found then
    raise exception 'onboarding_already_completed' using errcode = '55000';
  end if;
end;
$$;

revoke all on function private.complete_profile_onboarding(text) from public, anon, authenticated;
grant execute on function private.complete_profile_onboarding(text) to authenticated;

create or replace function public.complete_profile_onboarding(p_display_name text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.complete_profile_onboarding(p_display_name);
$$;

revoke all on function public.complete_profile_onboarding(text) from public, anon, authenticated;
grant execute on function public.complete_profile_onboarding(text) to authenticated;

alter table public.profiles enable row level security;
drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Users can create their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;

revoke all privileges on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;
