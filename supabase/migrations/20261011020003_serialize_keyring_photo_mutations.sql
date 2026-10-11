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
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if tg_op = 'INSERT' then
    target_keyring_id := new.keyring_id;
    target_owner := new.owner_id;
  else
    target_keyring_id := old.keyring_id;
    target_owner := old.owner_id;
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
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if tg_op = 'INSERT' then
    object_name := new.name;
    object_bucket := new.bucket_id;
  else
    object_name := old.name;
    object_bucket := old.bucket_id;
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

create or replace function private.assert_keyring_photos_ready()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.memory_entries as memory
    where memory.keyring_id = new.id
      and memory.owner_id = new.owner_id
      and memory.status = 'draft'
      and memory.image_path is not null
      and not exists (
        select 1 from storage.objects as object
        where object.bucket_id = 'memory-photos'
          and object.name = memory.image_path
      )
  ) then
    raise exception 'keyring_has_pending_photo_upload' using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function private.lock_keyring_memory_mutation() from public, anon, authenticated;
revoke all on function private.lock_keyring_photo_mutation() from public, anon, authenticated;
revoke all on function private.assert_keyring_photos_ready() from public, anon, authenticated;

drop trigger if exists lock_keyring_on_memory_insert on public.memory_entries;
create trigger lock_keyring_on_memory_insert
  before insert on public.memory_entries
  for each row execute function private.lock_keyring_memory_mutation();

drop trigger if exists lock_keyring_on_memory_delete on public.memory_entries;
create trigger lock_keyring_on_memory_delete
  before delete on public.memory_entries
  for each row execute function private.lock_keyring_memory_mutation();

drop trigger if exists lock_keyring_on_photo_insert on storage.objects;
create trigger lock_keyring_on_photo_insert
  before insert on storage.objects
  for each row execute function private.lock_keyring_photo_mutation();

drop trigger if exists lock_keyring_on_photo_delete on storage.objects;
create trigger lock_keyring_on_photo_delete
  before delete on storage.objects
  for each row execute function private.lock_keyring_photo_mutation();

drop trigger if exists require_keyring_photos_before_transfer on public.keyrings;
create trigger require_keyring_photos_before_transfer
  before update of status on public.keyrings
  for each row
  when (old.status = 'active' and new.status = 'pending_transfer')
  execute function private.assert_keyring_photos_ready();
