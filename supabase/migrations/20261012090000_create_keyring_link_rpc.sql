-- Allow the app's anonymous-authenticated session to issue a physical keyring link.
-- The secret pairing code from create_unpaired_keyring is deliberately not returned.
create or replace function public.create_keyring_link(p_name text default 'Poom 키링')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  issued jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  issued := public.create_unpaired_keyring(p_name);

  return jsonb_build_object(
    'id', issued -> 'id',
    'public_id', issued -> 'public_id',
    'name', issued -> 'name',
    'status', issued -> 'status',
    'created_at', issued -> 'created_at'
  );
end;
$$;

revoke all on function public.create_keyring_link(text) from public, anon, authenticated;
grant execute on function public.create_keyring_link(text) to authenticated;
