create or replace function private.lock_keyring_memory_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  keyring_owner uuid;
  keyring_status text;
  target_keyring_id uuid;
  target_owner uuid;
begin
  if tg_op = 'INSERT' then
    target_keyring_id := new.keyring_id;
    target_owner := new.owner_id;
  else
    target_keyring_id := old.keyring_id;
    target_owner := old.owner_id;
  end if;

  if current_user_id is null then
    if tg_op = 'DELETE' and pg_catalog.pg_trigger_depth() > 1 then
      return old;
    end if;
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if target_keyring_id is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select keyring.owner_id, keyring.status
  into keyring_owner, keyring_status
  from public.keyrings as keyring
  where keyring.id = target_keyring_id
  for update;

  if not found or keyring_owner <> current_user_id or target_owner <> current_user_id then
    raise exception 'keyring_not_owned' using errcode = '42501';
  end if;
  if keyring_status <> 'active' then
    raise exception 'keyring_not_active' using errcode = '55000';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
