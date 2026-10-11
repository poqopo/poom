alter table public.keyrings
  alter column owner_id drop not null,
  add column if not exists created_by_id uuid references auth.users (id) on delete set null,
  add column if not exists status text not null default 'active',
  add column if not exists pairing_code_hash text,
  add column if not exists pairing_code_salt text,
  add column if not exists pairing_attempts integer not null default 0,
  add column if not exists pairing_expires_at timestamptz,
  add column if not exists paired_at timestamptz,
  add column if not exists transferred_at timestamptz;

alter table public.keyrings drop constraint if exists keyrings_owner_id_key;
alter table public.keyrings drop constraint if exists keyrings_pairing_attempts_check;
alter table public.keyrings drop constraint if exists keyrings_status_check;
alter table public.keyrings
  add constraint keyrings_pairing_attempts_check
    check (pairing_attempts between 0 and 5),
  add constraint keyrings_status_check
    check (status in ('unpaired', 'active', 'pending_transfer', 'transferred'));

update public.keyrings
set created_by_id = owner_id
where created_by_id is null and owner_id is not null;

update public.memory_transfers
set status = 'expired'
where status = 'pending' and expires_at <= now();

insert into public.transfer_items (transfer_id, memory_id)
select transfer.id, memory.id
from public.memory_transfers as transfer
join public.memory_entries as memory
  on memory.keyring_id = transfer.keyring_id
  and memory.owner_id = transfer.sender_id
  and memory.status = 'draft'
where transfer.status = 'pending'
  and transfer.expires_at > now()
on conflict do nothing;

update public.keyrings as keyring
set status = 'pending_transfer'
where exists (
  select 1 from public.memory_transfers as transfer
  where transfer.keyring_id = keyring.id
    and transfer.status = 'pending'
    and transfer.expires_at > now()
);

update public.keyrings as keyring
set status = 'transferred',
    owner_id = transfer.recipient_id,
    transferred_at = transfer.completed_at
from public.memory_transfers as transfer
where transfer.keyring_id = keyring.id
  and transfer.status = 'completed'
  and transfer.recipient_id is not null
  and not exists (
    select 1 from public.memory_entries as memory
    where memory.keyring_id = keyring.id
      and memory.status = 'draft'
  );

update public.keyrings as keyring
set status = 'active'
where keyring.status = 'pending_transfer'
  and not exists (
    select 1 from public.memory_transfers as transfer
    where transfer.keyring_id = keyring.id
      and transfer.status = 'pending'
      and transfer.expires_at > now()
  );

create index if not exists keyrings_owner_created_idx
  on public.keyrings (owner_id, created_at desc);
create index if not exists keyrings_creator_created_idx
  on public.keyrings (created_by_id, created_at desc);

alter table public.world_regions
  drop constraint if exists world_regions_transfer_id_key;
alter table public.world_regions
  add constraint world_regions_transfer_region_unique unique (transfer_id, region_type);

drop policy if exists "Users can read their own keyrings" on public.keyrings;
create policy "Users can read owned and created unpaired keyrings"
  on public.keyrings for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (status = 'unpaired' and created_by_id = (select auth.uid()))
  );

drop policy if exists "Users can read their own memory entries" on public.memory_entries;
create policy "Users can read their own keyring memories"
  on public.memory_entries for select to authenticated
  using (
    owner_id = (select auth.uid())
    and (
      keyring_id is null
      or exists (
        select 1 from public.keyrings as keyring
        where keyring.id = memory_entries.keyring_id
          and keyring.owner_id = (select auth.uid())
          and keyring.status in ('active', 'pending_transfer', 'transferred')
      )
    )
  );

drop policy if exists "Users can create their own memory entries" on public.memory_entries;
create policy "Owners can create memories on active paired keyrings"
  on public.memory_entries for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and keyring_id is not null
    and status = 'draft'
    and exists (
      select 1 from public.keyrings as keyring
      where keyring.id = memory_entries.keyring_id
        and keyring.owner_id = (select auth.uid())
        and keyring.status = 'active'
    )
    and (
      image_path is null
      or (
        split_part(image_path, '/', 1) = keyring_id::text
        and split_part(image_path, '/', 2) = id::text
        and split_part(image_path, '/', 3) in ('photo.jpg', 'photo.png', 'photo.webp')
      )
    )
  );

drop policy if exists "Users can delete their own draft memory entries" on public.memory_entries;
create policy "Owners can delete draft memories on active keyrings"
  on public.memory_entries for delete to authenticated
  using (
    owner_id = (select auth.uid())
    and status = 'draft'
    and (
      keyring_id is null
      or exists (
        select 1 from public.keyrings as keyring
        where keyring.id = memory_entries.keyring_id
          and keyring.owner_id = (select auth.uid())
          and keyring.status = 'active'
      )
    )
    and not private.memory_has_active_transfer(id)
  );

drop policy if exists "Memory owners can read private photos" on storage.objects;
create policy "Owners can read private keyring photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'memory-photos'
    and exists (
      select 1
      from public.memory_entries as memory
      left join public.keyrings as keyring on keyring.id = memory.keyring_id
      where memory.image_path = storage.objects.name
        and memory.owner_id = (select auth.uid())
        and (
          memory.keyring_id is null
          or (
            keyring.owner_id = (select auth.uid())
            and keyring.status in ('active', 'pending_transfer', 'transferred')
          )
        )
    )
  );

drop policy if exists "Memory owners can upload private photos" on storage.objects;
create policy "Owners can upload photos to active keyrings"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'memory-photos'
    and exists (
      select 1
      from public.memory_entries as memory
      join public.keyrings as keyring on keyring.id = memory.keyring_id
      where memory.image_path = storage.objects.name
        and memory.owner_id = (select auth.uid())
        and memory.status = 'draft'
        and keyring.owner_id = (select auth.uid())
        and keyring.status = 'active'
        and split_part(storage.objects.name, '/', 1) = keyring.id::text
        and split_part(storage.objects.name, '/', 2) = memory.id::text
        and split_part(storage.objects.name, '/', 3) in ('photo.jpg', 'photo.png', 'photo.webp')
    )
  );

drop policy if exists "Memory owners can delete private photos" on storage.objects;
create policy "Owners can delete draft photos on active keyrings"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'memory-photos'
    and exists (
      select 1
      from public.memory_entries as memory
      left join public.keyrings as keyring on keyring.id = memory.keyring_id
      where memory.image_path = storage.objects.name
        and memory.owner_id = (select auth.uid())
        and memory.status = 'draft'
        and (
          memory.keyring_id is null
          or (keyring.owner_id = (select auth.uid()) and keyring.status = 'active')
        )
    )
  );

create or replace function private.keyring_region_type(p_text text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when lower(coalesce(p_text, '')) ~ '(카페|커피|빵|차|라떼|cafe|coffee|bakery)' then 'cafe'
    when lower(coalesce(p_text, '')) ~ '(꽃|정원|화분|식물|garden|flower)' then 'garden'
    when lower(coalesce(p_text, '')) ~ '(공원|산책|하늘|바람|비|계절|park|walk|sky)' then 'park'
    else 'street'
  end;
$$;

revoke all on function private.keyring_region_type(text) from public, anon, authenticated;

create or replace function public.create_unpaired_keyring(p_name text default '나의 추억 키링')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  keyring public.keyrings;
  random_bytes bytea;
  salt_bytes bytea;
  pairing_code text;
  pairing_hash text;
  pairing_expiry timestamptz := now() + interval '30 minutes';
  normalized_name text;
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  normalized_name := pg_catalog.btrim(coalesce(p_name, '나의 추억 키링'));
  if pg_catalog.char_length(normalized_name) < 1 or pg_catalog.char_length(normalized_name) > 40 then
    raise exception 'invalid_keyring_name' using errcode = '22023';
  end if;

  random_bytes := extensions.gen_random_bytes(4);
  pairing_code := pg_catalog.lpad((((pg_catalog.get_byte(random_bytes, 0)::bigint << 24)
    + (pg_catalog.get_byte(random_bytes, 1)::bigint << 16)
    + (pg_catalog.get_byte(random_bytes, 2)::bigint << 8)
    + pg_catalog.get_byte(random_bytes, 3)::bigint) % 100000000)::text, 8, '0');
  salt_bytes := extensions.gen_random_bytes(16);
  pairing_hash := pg_catalog.encode(
    extensions.digest(pairing_code || pg_catalog.encode(salt_bytes, 'hex'), 'sha256'),
    'hex'
  );

  insert into public.keyrings (
    created_by_id, status, name, pairing_code_hash, pairing_code_salt,
    pairing_attempts, pairing_expires_at
  ) values (
    current_user_id, 'unpaired', normalized_name, pairing_hash,
    pg_catalog.encode(salt_bytes, 'hex'), 0, pairing_expiry
  ) returning * into keyring;

  return pg_catalog.jsonb_build_object(
    'id', keyring.id,
    'public_id', keyring.public_id,
    'name', keyring.name,
    'status', keyring.status,
    'created_at', keyring.created_at,
    'pairing_code', pairing_code,
    'pairing_expires_at', pairing_expiry
  );
end;
$$;

create or replace function public.rotate_keyring_pairing_code(p_public_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  keyring_id_value uuid;
  salt_bytes bytea;
  random_bytes bytea;
  pairing_code text;
  pairing_hash text;
  pairing_expiry timestamptz := now() + interval '30 minutes';
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select keyring.id into keyring_id_value
  from public.keyrings as keyring
  where keyring.public_id = p_public_id
    and keyring.created_by_id = current_user_id
    and keyring.status = 'unpaired'
  for update;
  if keyring_id_value is null then
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'keyring_not_pairable');
  end if;

  random_bytes := extensions.gen_random_bytes(4);
  pairing_code := pg_catalog.lpad((((pg_catalog.get_byte(random_bytes, 0)::bigint << 24)
    + (pg_catalog.get_byte(random_bytes, 1)::bigint << 16)
    + (pg_catalog.get_byte(random_bytes, 2)::bigint << 8)
    + pg_catalog.get_byte(random_bytes, 3)::bigint) % 100000000)::text, 8, '0');
  salt_bytes := extensions.gen_random_bytes(16);
  pairing_hash := pg_catalog.encode(
    extensions.digest(pairing_code || pg_catalog.encode(salt_bytes, 'hex'), 'sha256'),
    'hex'
  );

  update public.keyrings
  set pairing_code_hash = pairing_hash,
      pairing_code_salt = pg_catalog.encode(salt_bytes, 'hex'),
      pairing_attempts = 0,
      pairing_expires_at = pairing_expiry
  where id = keyring_id_value;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'pairing_code', pairing_code,
    'pairing_expires_at', pairing_expiry
  );
end;
$$;

create or replace function public.pair_keyring(p_public_id text, p_pairing_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  keyring public.keyrings;
  next_attempt integer;
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into keyring
  from public.keyrings as candidate
  where candidate.public_id = p_public_id
  for update;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'keyring_not_found');
  end if;
  if keyring.status = 'active' and keyring.owner_id = current_user_id then
    return pg_catalog.jsonb_build_object('ok', true, 'id', keyring.id, 'status', keyring.status);
  end if;
  if keyring.status <> 'unpaired' then
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'keyring_not_pairable');
  end if;
  if keyring.pairing_expires_at <= now() then
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'pairing_code_expired');
  end if;
  if keyring.pairing_attempts >= 5 then
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'pairing_attempt_limit');
  end if;

  if p_pairing_code is null or p_pairing_code !~ '^[0-9]{8}$'
    or pg_catalog.encode(
      extensions.digest(p_pairing_code || keyring.pairing_code_salt, 'sha256'),
      'hex'
    ) <> keyring.pairing_code_hash then
    next_attempt := keyring.pairing_attempts + 1;
    update public.keyrings set pairing_attempts = next_attempt where id = keyring.id;
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'error', case when next_attempt >= 5 then 'pairing_attempt_limit' else 'invalid_pairing_code' end,
      'attempts_remaining', greatest(0, 5 - next_attempt)
    );
  end if;

  update public.keyrings
  set owner_id = current_user_id,
      status = 'active',
      paired_at = now(),
      pairing_code_hash = null,
      pairing_code_salt = null,
      pairing_attempts = 0,
      pairing_expires_at = null
  where id = keyring.id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'id', keyring.id,
    'public_id', keyring.public_id,
    'name', keyring.name,
    'status', 'active'
  );
end;
$$;

create or replace function public.get_keyring_state(p_public_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  keyring public.keyrings;
  transfer_id_value uuid;
  expiry_value timestamptz;
  item_count integer;
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into keyring
  from public.keyrings as candidate
  where candidate.public_id = p_public_id
  for update;
  if not found then
    return pg_catalog.jsonb_build_object('exists', false);
  end if;

  if keyring.status = 'pending_transfer' then
    select transfer.id, transfer.expires_at
    into transfer_id_value, expiry_value
    from public.memory_transfers as transfer
    where transfer.keyring_id = keyring.id and transfer.status = 'pending'
    for update;

    if transfer_id_value is null or expiry_value <= now() then
      if transfer_id_value is not null then
        update public.memory_transfers set status = 'expired' where id = transfer_id_value;
      end if;
      update public.keyrings set status = 'active' where id = keyring.id;
      keyring.status := 'active';
      expiry_value := null;
      transfer_id_value := null;
    end if;
  end if;

  if keyring.owner_id = current_user_id
    and keyring.status in ('active', 'pending_transfer', 'transferred') then
    select count(*)::integer into item_count
    from public.memory_entries as memory
    where memory.keyring_id = keyring.id and memory.owner_id = current_user_id;
  else
    item_count := null;
  end if;

  return pg_catalog.jsonb_build_object(
    'exists', true,
    'id', keyring.id,
    'public_id', keyring.public_id,
    'status', keyring.status,
    'is_owner', keyring.owner_id = current_user_id,
    'is_creator', keyring.status = 'unpaired' and keyring.created_by_id = current_user_id,
    'name', case
      when keyring.owner_id = current_user_id
        or (keyring.status = 'unpaired' and keyring.created_by_id = current_user_id)
      then keyring.name else null end,
    'memory_count', item_count,
    'pairing_expires_at', case
      when keyring.status = 'unpaired' and keyring.created_by_id = current_user_id
      then keyring.pairing_expires_at else null end,
    'transfer_id', case
      when keyring.status = 'pending_transfer' and keyring.owner_id = current_user_id
      then transfer_id_value else null end,
    'transfer_expires_at', case
      when keyring.status = 'pending_transfer' then expiry_value else null end
  );
end;
$$;

create or replace function public.prepare_keyring_transfer(
  p_public_id text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  keyring public.keyrings;
  existing_transfer public.memory_transfers;
  transfer_id_value uuid;
  code_bytes bytea;
  salt_bytes bytea;
  code_value text;
  code_hash_value text;
  expires_value timestamptz;
  item_count integer;
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_idempotency_key is null or pg_catalog.length(p_idempotency_key) < 16
    or pg_catalog.length(p_idempotency_key) > 120 then
    raise exception 'invalid_idempotency_key' using errcode = '22023';
  end if;

  select * into keyring
  from public.keyrings as candidate
  where candidate.public_id = p_public_id
    and candidate.owner_id = current_user_id
  for update;
  if not found then
    raise exception 'keyring_not_owned' using errcode = '42501';
  end if;

  if keyring.status = 'pending_transfer' then
    select * into existing_transfer
    from public.memory_transfers as transfer
    where transfer.keyring_id = keyring.id and transfer.status = 'pending'
    for update;

    if existing_transfer.id is null or existing_transfer.expires_at <= now() then
      if existing_transfer.id is not null then
        update public.memory_transfers set status = 'expired' where id = existing_transfer.id;
      end if;
      update public.keyrings set status = 'active' where id = keyring.id;
      keyring.status := 'active';
    elsif existing_transfer.idempotency_key <> p_idempotency_key then
      raise exception 'keyring_has_pending_transfer' using errcode = '55000';
    else
      code_bytes := extensions.gen_random_bytes(4);
      code_value := pg_catalog.lpad((((pg_catalog.get_byte(code_bytes, 0)::bigint << 24)
        + (pg_catalog.get_byte(code_bytes, 1)::bigint << 16)
        + (pg_catalog.get_byte(code_bytes, 2)::bigint << 8)
        + pg_catalog.get_byte(code_bytes, 3)::bigint) % 100000000)::text, 8, '0');
      salt_bytes := extensions.gen_random_bytes(16);
      code_hash_value := pg_catalog.encode(
        extensions.digest(code_value || pg_catalog.encode(salt_bytes, 'hex'), 'sha256'),
        'hex'
      );
      expires_value := now() + interval '10 minutes';
      update public.memory_transfers
      set code_hash = code_hash_value,
          code_salt = pg_catalog.encode(salt_bytes, 'hex'),
          attempts = 0,
          expires_at = expires_value
      where id = existing_transfer.id;
      return pg_catalog.jsonb_build_object(
        'transfer_id', existing_transfer.id,
        'code', code_value,
        'expires_at', expires_value,
        'reused', true
      );
    end if;
  end if;
  if keyring.status <> 'active' then
    raise exception 'keyring_not_active' using errcode = '55000';
  end if;

  if exists (
    select 1 from public.memory_transfers as transfer
    where transfer.sender_id = current_user_id
      and transfer.idempotency_key = p_idempotency_key
      and transfer.status <> 'pending'
  ) then
    raise exception 'idempotency_key_already_used' using errcode = '55000';
  end if;

  perform memory.id
  from public.memory_entries as memory
  where memory.keyring_id = keyring.id
    and memory.owner_id = current_user_id
    and memory.status = 'draft'
  order by memory.id
  for update;

  select count(*) into item_count
  from public.memory_entries as memory
  where memory.keyring_id = keyring.id
    and memory.owner_id = current_user_id
    and memory.status = 'draft';
  if item_count < 1 then
    raise exception 'keyring_has_no_memories' using errcode = '55000';
  end if;

  code_bytes := extensions.gen_random_bytes(4);
  code_value := pg_catalog.lpad((((pg_catalog.get_byte(code_bytes, 0)::bigint << 24)
    + (pg_catalog.get_byte(code_bytes, 1)::bigint << 16)
    + (pg_catalog.get_byte(code_bytes, 2)::bigint << 8)
    + pg_catalog.get_byte(code_bytes, 3)::bigint) % 100000000)::text, 8, '0');
  salt_bytes := extensions.gen_random_bytes(16);
  code_hash_value := pg_catalog.encode(
    extensions.digest(code_value || pg_catalog.encode(salt_bytes, 'hex'), 'sha256'),
    'hex'
  );
  expires_value := now() + interval '10 minutes';

  insert into public.memory_transfers (
    sender_id, keyring_id, idempotency_key, code_hash, code_salt, expires_at
  ) values (
    current_user_id, keyring.id, p_idempotency_key, code_hash_value,
    pg_catalog.encode(salt_bytes, 'hex'), expires_value
  ) returning id into transfer_id_value;

  insert into public.transfer_items (transfer_id, memory_id)
  select transfer_id_value, memory.id
  from public.memory_entries as memory
  where memory.keyring_id = keyring.id
    and memory.owner_id = current_user_id
    and memory.status = 'draft';

  update public.keyrings set status = 'pending_transfer' where id = keyring.id;

  return pg_catalog.jsonb_build_object(
    'transfer_id', transfer_id_value,
    'code', code_value,
    'expires_at', expires_value,
    'reused', false,
    'memory_count', item_count
  );
end;
$$;

create or replace function public.reissue_keyring_transfer(p_public_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  keyring_id_value uuid;
  transfer public.memory_transfers;
  code_bytes bytea;
  salt_bytes bytea;
  code_value text;
  code_hash_value text;
  expires_value timestamptz;
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select keyring.id into keyring_id_value
  from public.keyrings as keyring
  where keyring.public_id = p_public_id
    and keyring.owner_id = current_user_id
    and keyring.status = 'pending_transfer'
  for update;
  if keyring_id_value is null then
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'pending_transfer_not_found');
  end if;

  select * into transfer
  from public.memory_transfers as current_transfer
  where current_transfer.keyring_id = keyring_id_value
    and current_transfer.status = 'pending'
  for update;
  if transfer.id is null or transfer.expires_at <= now() then
    if transfer.id is not null then
      update public.memory_transfers set status = 'expired' where id = transfer.id;
    end if;
    update public.keyrings set status = 'active' where id = keyring_id_value;
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'transfer_expired');
  end if;

  code_bytes := extensions.gen_random_bytes(4);
  code_value := pg_catalog.lpad((((pg_catalog.get_byte(code_bytes, 0)::bigint << 24)
    + (pg_catalog.get_byte(code_bytes, 1)::bigint << 16)
    + (pg_catalog.get_byte(code_bytes, 2)::bigint << 8)
    + pg_catalog.get_byte(code_bytes, 3)::bigint) % 100000000)::text, 8, '0');
  salt_bytes := extensions.gen_random_bytes(16);
  code_hash_value := pg_catalog.encode(
    extensions.digest(code_value || pg_catalog.encode(salt_bytes, 'hex'), 'sha256'),
    'hex'
  );
  expires_value := now() + interval '10 minutes';

  update public.memory_transfers
  set code_hash = code_hash_value,
      code_salt = pg_catalog.encode(salt_bytes, 'hex'),
      attempts = 0,
      expires_at = expires_value
  where id = transfer.id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'transfer_id', transfer.id,
    'code', code_value,
    'expires_at', expires_value
  );
end;
$$;

create or replace function public.cancel_keyring_transfer(p_public_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  keyring_id_value uuid;
  transfer_id_value uuid;
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select keyring.id into keyring_id_value
  from public.keyrings as keyring
  where keyring.public_id = p_public_id
    and keyring.owner_id = current_user_id
    and keyring.status = 'pending_transfer'
  for update;
  if keyring_id_value is null then
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'pending_transfer_not_found');
  end if;

  update public.memory_transfers
  set status = 'cancelled'
  where keyring_id = keyring_id_value and status = 'pending'
  returning id into transfer_id_value;
  if transfer_id_value is null then
    update public.keyrings set status = 'active' where id = keyring_id_value;
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'pending_transfer_not_found');
  end if;

  update public.keyrings set status = 'active' where id = keyring_id_value;
  return pg_catalog.jsonb_build_object('ok', true, 'status', 'active');
end;
$$;

create or replace function public.receive_transfer(p_public_id text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  keyring public.keyrings;
  transfer public.memory_transfers;
  next_attempt integer;
  item_count integer;
  memory_count integer;
  updated_count integer;
  region_record record;
  object_data jsonb;
  region_id_value uuid;
  region_name text;
  created_regions jsonb := '[]'::jsonb;
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into keyring
  from public.keyrings as candidate
  where candidate.public_id = p_public_id
  for update;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'keyring_not_found');
  end if;
  if keyring.status = 'transferred' then
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'keyring_already_transferred');
  end if;
  if keyring.status = 'unpaired' then
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'keyring_not_paired');
  end if;
  if keyring.status = 'active' then
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'no_pending_transfer');
  end if;

  select * into transfer
  from public.memory_transfers as current_transfer
  where current_transfer.keyring_id = keyring.id
    and current_transfer.status = 'pending'
  for update;
  if transfer.id is null then
    update public.keyrings set status = 'active' where id = keyring.id;
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'no_pending_transfer');
  end if;
  if transfer.expires_at <= now() then
    update public.memory_transfers set status = 'expired' where id = transfer.id;
    update public.keyrings set status = 'active' where id = keyring.id;
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'transfer_expired');
  end if;
  if transfer.sender_id = current_user_id then
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'cannot_receive_own_transfer');
  end if;
  if transfer.attempts >= 5 then
    update public.memory_transfers set status = 'cancelled' where id = transfer.id;
    update public.keyrings set status = 'active' where id = keyring.id;
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'attempt_limit_reached');
  end if;

  if p_code is null or p_code !~ '^[0-9]{8}$'
    or pg_catalog.encode(
      extensions.digest(p_code || transfer.code_salt, 'sha256'),
      'hex'
    ) <> transfer.code_hash then
    next_attempt := transfer.attempts + 1;
    update public.memory_transfers
    set attempts = next_attempt,
        status = case when next_attempt >= 5 then 'cancelled' else status end
    where id = transfer.id;
    if next_attempt >= 5 then
      update public.keyrings set status = 'active' where id = keyring.id;
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'error', case when next_attempt >= 5 then 'attempt_limit_reached' else 'invalid_code' end,
      'attempts_remaining', greatest(0, 5 - next_attempt)
    );
  end if;

  select count(*) into item_count
  from public.transfer_items as item
  where item.transfer_id = transfer.id;
  select count(*) into memory_count
  from public.memory_entries as memory
  where memory.keyring_id = keyring.id
    and memory.owner_id = transfer.sender_id
    and memory.status = 'draft';
  if item_count < 1 or item_count <> memory_count then
    raise exception 'transfer_snapshot_mismatch' using errcode = '55000';
  end if;

  update public.memory_transfers
  set status = 'completed',
      recipient_id = current_user_id,
      completed_at = now()
  where id = transfer.id and status = 'pending' and expires_at > now();
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'transfer_already_claimed');
  end if;

  update public.memory_entries as memory
  set owner_id = current_user_id,
      status = 'transferred',
      transferred_at = now()
  where memory.keyring_id = keyring.id
    and memory.owner_id = transfer.sender_id
    and memory.status = 'draft';
  get diagnostics updated_count = row_count;
  if updated_count <> item_count then
    raise exception 'memory_ownership_changed' using errcode = '55000';
  end if;

  update public.keyrings
  set owner_id = current_user_id,
      status = 'transferred',
      transferred_at = now()
  where id = keyring.id and owner_id = transfer.sender_id;
  if not found then
    raise exception 'keyring_ownership_changed' using errcode = '55000';
  end if;

  for region_record in
    select private.keyring_region_type(memory.text_content) as region_type
    from public.transfer_items as item
    join public.memory_entries as memory on memory.id = item.memory_id
    where item.transfer_id = transfer.id
    group by private.keyring_region_type(memory.text_content)
  loop
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'memory_id', selected.memory_id,
          'x', 2 + ((selected.position - 1) % 4) * 3,
          'y', 2 + (((selected.position - 1) / 4)::integer) * 3,
          'kind', case when selected.image_path is null then 'letter' else 'photo' end
        ) order by selected.position
      ),
      '[]'::jsonb
    ) into object_data
    from (
      select memory.id as memory_id,
        memory.image_path,
        pg_catalog.row_number() over (order by memory.id) as position
      from public.transfer_items as item
      join public.memory_entries as memory on memory.id = item.memory_id
      where item.transfer_id = transfer.id
        and private.keyring_region_type(memory.text_content) = region_record.region_type
    ) as selected;

    region_name := case region_record.region_type
      when 'cafe' then '햇살 카페'
      when 'garden' then '작은 정원'
      when 'park' then '바람 공원'
      else '기억의 거리'
    end;

    insert into public.world_regions (owner_id, transfer_id, region_type, name, map_data)
    values (
      current_user_id,
      transfer.id,
      region_record.region_type,
      region_name,
      pg_catalog.jsonb_build_object(
        'version', 1,
        'template', region_record.region_type,
        'grid', pg_catalog.jsonb_build_object('columns', 16, 'rows', 12),
        'objects', object_data
      )
    ) returning id into region_id_value;

    created_regions := created_regions || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', region_id_value,
        'region_type', region_record.region_type,
        'name', region_name
      )
    );
  end loop;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'transfer_id', transfer.id,
    'regions', created_regions,
    'memory_count', item_count
  );
end;
$$;

revoke all on function public.create_my_keyring() from public, anon, authenticated;
revoke all on function public.get_public_keyring(text) from public, anon, authenticated;
revoke all on function public.create_transfer_session(uuid, uuid[], text) from public, anon, authenticated;
revoke all on function public.create_unpaired_keyring(text) from public, anon, authenticated;
revoke all on function public.rotate_keyring_pairing_code(text) from public, anon, authenticated;
revoke all on function public.pair_keyring(text, text) from public, anon, authenticated;
revoke all on function public.get_keyring_state(text) from public, anon, authenticated;
revoke all on function public.prepare_keyring_transfer(text, text) from public, anon, authenticated;
revoke all on function public.reissue_keyring_transfer(text) from public, anon, authenticated;
revoke all on function public.cancel_keyring_transfer(text) from public, anon, authenticated;
revoke all on function public.receive_transfer(text, text) from public, anon, authenticated;

grant execute on function public.create_unpaired_keyring(text) to authenticated;
grant execute on function public.rotate_keyring_pairing_code(text) to authenticated;
grant execute on function public.pair_keyring(text, text) to authenticated;
grant execute on function public.get_keyring_state(text) to authenticated;
grant execute on function public.prepare_keyring_transfer(text, text) to authenticated;
grant execute on function public.reissue_keyring_transfer(text) to authenticated;
grant execute on function public.cancel_keyring_transfer(text) to authenticated;
grant execute on function public.receive_transfer(text, text) to authenticated;
