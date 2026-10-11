create or replace function public.create_my_keyring()
returns public.keyrings
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  result public.keyrings;
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  insert into public.keyrings (owner_id)
  values (current_user_id)
  on conflict (owner_id) do update set owner_id = excluded.owner_id
  returning * into result;

  update public.memory_entries
  set keyring_id = result.id
  where owner_id = current_user_id
    and keyring_id is null
    and status = 'draft';

  return result;
end;
$$;

revoke all on function public.create_my_keyring() from public, anon;
grant execute on function public.create_my_keyring() to authenticated;
