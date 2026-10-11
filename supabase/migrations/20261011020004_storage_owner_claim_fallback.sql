create or replace function private.lock_keyring_photo_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  object_name text;
  object_bucket text;
  memory_owner uuid;
  memory_status text;
  memory_keyring_id uuid;
  keyring_owner uuid;
  keyring_status text;
begin
  if tg_op = 'INSERT' then
    object_name := new.name;
    object_bucket := new.bucket_id;
    current_user_id := coalesce(current_user_id, new.owner);
  else
    object_name := old.name;
    object_bucket := old.bucket_id;
    current_user_id := coalesce(current_user_id, old.owner);
  end if;
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if object_bucket <> 'memory-photos' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select memory.owner_id, memory.status, memory.keyring_id
  into memory_owner, memory_status, memory_keyring_id
  from public.memory_entries as memory
  where memory.image_path = object_name;
  if not found or memory_owner <> current_user_id or memory_status <> 'draft' then
    raise exception 'memory_photo_not_writable' using errcode = '42501';
  end if;

  if memory_keyring_id is not null then
    select keyring.owner_id, keyring.status
    into keyring_owner, keyring_status
    from public.keyrings as keyring
    where keyring.id = memory_keyring_id
    for update;

    if not found or keyring_owner <> current_user_id then
      raise exception 'keyring_not_owned' using errcode = '42501';
    end if;
    if keyring_status <> 'active' then
      raise exception 'keyring_not_active' using errcode = '55000';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
