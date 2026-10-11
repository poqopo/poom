-- Only trusted administrators can issue unpaired physical keyrings.
-- Existing issued/paired keyrings and their data are left untouched.
create or replace function public.admin_create_unpaired_keyring(p_name text default 'Poom 키링')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  return public.create_unpaired_keyring(p_name);
end;
$$;

revoke all on function public.admin_create_unpaired_keyring(text) from public, anon, authenticated;
revoke all on function public.create_unpaired_keyring(text) from public, anon, authenticated;
grant execute on function public.admin_create_unpaired_keyring(text) to authenticated;
