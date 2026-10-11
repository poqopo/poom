create extension if not exists pgcrypto with schema extensions;

create table if not exists public.keyrings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  public_id text not null unique default lower(encode(extensions.gen_random_bytes(16), 'hex')),
  name text not null default '나의 추억 키링',
  created_at timestamptz not null default now(),
  constraint keyrings_name_length check (char_length(name) between 1 and 40)
);

alter table public.memory_entries
  add column if not exists keyring_id uuid references public.keyrings (id) on delete set null,
  add column if not exists transferred_at timestamptz;

create index if not exists memory_entries_owner_status_created_idx
  on public.memory_entries (owner_id, status, created_at desc);

create table if not exists public.memory_transfers (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users (id) on delete cascade,
  recipient_id uuid references auth.users (id) on delete set null,
  keyring_id uuid not null references public.keyrings (id) on delete cascade,
  idempotency_key text not null,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'cancelled', 'expired')),
  code_hash text not null,
  code_salt text not null,
  attempts integer not null default 0 check (attempts between 0 and 5),
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint memory_transfers_idempotency_unique unique (sender_id, idempotency_key)
);

create unique index if not exists memory_transfers_one_pending_per_keyring_idx
  on public.memory_transfers (keyring_id)
  where status = 'pending';

create index if not exists memory_transfers_keyring_status_expiry_idx
  on public.memory_transfers (keyring_id, status, expires_at);

create table if not exists public.transfer_items (
  transfer_id uuid not null references public.memory_transfers (id) on delete cascade,
  memory_id uuid not null references public.memory_entries (id) on delete cascade,
  primary key (transfer_id, memory_id),
  unique (memory_id, transfer_id)
);

create table if not exists public.world_regions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  transfer_id uuid not null unique references public.memory_transfers (id) on delete cascade,
  region_type text not null check (region_type in ('cafe', 'park', 'garden', 'street')),
  name text not null,
  map_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists world_regions_owner_created_idx
  on public.world_regions (owner_id, created_at);

create or replace function private.memory_has_active_transfer(p_memory_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.transfer_items as item
    join public.memory_transfers as transfer on transfer.id = item.transfer_id
    where item.memory_id = p_memory_id
      and transfer.status = 'pending'
      and transfer.expires_at > now()
  );
$$;

revoke all on function private.memory_has_active_transfer(uuid) from public, anon;
grant execute on function private.memory_has_active_transfer(uuid) to authenticated;

alter table public.keyrings enable row level security;
alter table public.memory_transfers enable row level security;
alter table public.transfer_items enable row level security;
alter table public.world_regions enable row level security;

drop policy if exists "Users can update their own memory entries" on public.memory_entries;
drop policy if exists "Users can delete their own draft memory entries" on public.memory_entries;
create policy "Users can delete their own draft memory entries"
  on public.memory_entries for delete to authenticated
  using (
    (select auth.uid()) = owner_id
    and status = 'draft'
    and not private.memory_has_active_transfer(id)
  );

drop policy if exists "Users can create their own memory entries" on public.memory_entries;
create policy "Users can create their own memory entries"
  on public.memory_entries for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and status = 'draft'
    and (
      keyring_id is null
      or exists (
        select 1 from public.keyrings as keyring
        where keyring.id = memory_entries.keyring_id
          and keyring.owner_id = (select auth.uid())
      )
    )
    and (
      image_path is null
      or split_part(image_path, '/', 1) = (select auth.uid())::text
    )
  );

create policy "Users can read their own keyrings"
  on public.keyrings for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Users can read their own world regions"
  on public.world_regions for select to authenticated
  using ((select auth.uid()) = owner_id);

revoke all privileges on table public.keyrings from public, anon, authenticated;
revoke all privileges on table public.memory_transfers from public, anon, authenticated;
revoke all privileges on table public.transfer_items from public, anon, authenticated;
revoke all privileges on table public.world_regions from public, anon, authenticated;
grant select on table public.keyrings to authenticated;
grant select on table public.world_regions to authenticated;
revoke insert, update, delete on table public.memory_entries from anon, authenticated;
grant select, delete on table public.memory_entries to authenticated;
grant insert (id, owner_id, keyring_id, text_content, image_path)
  on table public.memory_entries to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'memory-photos',
  'memory-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Memory owners can read private photos" on storage.objects;
create policy "Memory owners can read private photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'memory-photos'
    and exists (
      select 1 from public.memory_entries as memory
      where memory.image_path = storage.objects.name
        and memory.owner_id = (select auth.uid())
    )
  );

drop policy if exists "Memory owners can upload private photos" on storage.objects;
create policy "Memory owners can upload private photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'memory-photos'
    and exists (
      select 1 from public.memory_entries as memory
      where memory.image_path = storage.objects.name
        and memory.owner_id = (select auth.uid())
        and memory.status = 'draft'
    )
  );

drop policy if exists "Memory owners can delete private photos" on storage.objects;
create policy "Memory owners can delete private photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'memory-photos'
    and exists (
      select 1 from public.memory_entries as memory
      where memory.image_path = storage.objects.name
        and memory.owner_id = (select auth.uid())
        and memory.status = 'draft'
    )
  );

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

  return result;
end;
$$;

create or replace function public.get_public_keyring(p_public_id text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', keyring.id,
    'public_id', keyring.public_id,
    'name', keyring.name,
    'pending_count', (
      select count(*)::integer
      from public.memory_transfers as transfer
      where transfer.keyring_id = keyring.id
        and transfer.status = 'pending'
        and transfer.expires_at > now()
    )
  )
  from public.keyrings as keyring
  where keyring.public_id = p_public_id;
$$;

create or replace function public.create_transfer_session(
  p_keyring_id uuid,
  p_memory_ids uuid[],
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  transfer_id uuid;
  transfer_status text;
  code_bytes bytea;
  salt_bytes bytea;
  code_value text;
  code_hash_value text;
  item_count integer;
  locked_count integer;
  expires_value timestamptz;
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_keyring_id is null or p_memory_ids is null
    or cardinality(p_memory_ids) < 1 or cardinality(p_memory_ids) > 10
    or cardinality(p_memory_ids) <> (select count(distinct value) from unnest(p_memory_ids) as value) then
    raise exception 'invalid_transfer_items' using errcode = '22023';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 16 or length(p_idempotency_key) > 120 then
    raise exception 'invalid_idempotency_key' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.keyrings
    where id = p_keyring_id and owner_id = current_user_id
  ) then
    raise exception 'keyring_not_owned' using errcode = '42501';
  end if;

  select id, status, expires_at
  into transfer_id, transfer_status, expires_value
  from public.memory_transfers
  where sender_id = current_user_id and idempotency_key = p_idempotency_key
  for update;

  if transfer_id is not null then
    if transfer_status <> 'pending' or expires_value <= now() then
      raise exception 'transfer_session_not_reusable' using errcode = '55000';
    end if;
    code_bytes := extensions.gen_random_bytes(4);
    code_value := lpad((((get_byte(code_bytes, 0)::bigint << 24)
      + (get_byte(code_bytes, 1)::bigint << 16)
      + (get_byte(code_bytes, 2)::bigint << 8)
      + get_byte(code_bytes, 3)::bigint) % 100000000)::text, 8, '0');
    salt_bytes := extensions.gen_random_bytes(16);
    code_hash_value := encode(
      extensions.digest(code_value || encode(salt_bytes, 'hex'), 'sha256'),
      'hex'
    );
    update public.memory_transfers
    set code_hash = code_hash_value, code_salt = encode(salt_bytes, 'hex'), attempts = 0
    where id = transfer_id;
    return jsonb_build_object(
      'transfer_id', transfer_id,
      'code', code_value,
      'expires_at', expires_value,
      'reused', true
    );
  end if;

  update public.memory_transfers
  set status = 'expired'
  where keyring_id = p_keyring_id and status = 'pending' and expires_at <= now();

  if exists (
    select 1 from public.memory_transfers
    where keyring_id = p_keyring_id and status = 'pending'
  ) then
    raise exception 'keyring_has_pending_transfer' using errcode = '55000';
  end if;

  perform memory.id
  from public.memory_entries as memory
  where memory.id = any(p_memory_ids)
    and memory.owner_id = current_user_id
    and memory.keyring_id = p_keyring_id
    and memory.status = 'draft'
  order by memory.id
  for update;

  select count(*) into locked_count
  from public.memory_entries as memory
  where memory.id = any(p_memory_ids)
    and memory.owner_id = current_user_id
    and memory.keyring_id = p_keyring_id
    and memory.status = 'draft';

  item_count := cardinality(p_memory_ids);
  if locked_count <> item_count then
    raise exception 'memory_not_available' using errcode = '42501';
  end if;

  code_bytes := extensions.gen_random_bytes(4);
  code_value := lpad((((get_byte(code_bytes, 0)::bigint << 24)
    + (get_byte(code_bytes, 1)::bigint << 16)
    + (get_byte(code_bytes, 2)::bigint << 8)
    + get_byte(code_bytes, 3)::bigint) % 100000000)::text, 8, '0');
  salt_bytes := extensions.gen_random_bytes(16);
  code_hash_value := encode(
    extensions.digest(code_value || encode(salt_bytes, 'hex'), 'sha256'),
    'hex'
  );
  expires_value := now() + interval '10 minutes';

  insert into public.memory_transfers (
    sender_id, keyring_id, idempotency_key, code_hash, code_salt, expires_at
  ) values (
    current_user_id, p_keyring_id, p_idempotency_key, code_hash_value,
    encode(salt_bytes, 'hex'), expires_value
  ) returning id into transfer_id;

  insert into public.transfer_items (transfer_id, memory_id)
  select transfer_id, unnest(p_memory_ids);

  return jsonb_build_object(
    'transfer_id', transfer_id,
    'code', code_value,
    'expires_at', expires_value,
    'reused', false
  );
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
  keyring_id_value uuid;
  sender_id_value uuid;
  transfer_id_value uuid;
  code_hash_value text;
  code_salt_value text;
  attempts_value integer;
  expiry_value timestamptz;
  item_count integer;
  updated_count integer;
  content_value text;
  region_kind text;
  region_name text;
  region_id_value uuid;
  object_data jsonb;
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select keyring.id into keyring_id_value
  from public.keyrings as keyring
  where keyring.public_id = p_public_id;
  if keyring_id_value is null then
    return jsonb_build_object('ok', false, 'error', 'keyring_not_found');
  end if;

  select transfer.id, transfer.sender_id, transfer.code_hash, transfer.code_salt,
    transfer.attempts, transfer.expires_at
  into transfer_id_value, sender_id_value, code_hash_value, code_salt_value,
    attempts_value, expiry_value
  from public.memory_transfers as transfer
  where transfer.keyring_id = keyring_id_value and transfer.status = 'pending'
  for update;

  if transfer_id_value is null then
    return jsonb_build_object('ok', false, 'error', 'no_pending_transfer');
  end if;
  if expiry_value <= now() then
    update public.memory_transfers set status = 'expired' where id = transfer_id_value;
    return jsonb_build_object('ok', false, 'error', 'transfer_expired');
  end if;
  if sender_id_value = current_user_id then
    return jsonb_build_object('ok', false, 'error', 'cannot_receive_own_transfer');
  end if;
  if attempts_value >= 5 then
    update public.memory_transfers set status = 'cancelled' where id = transfer_id_value;
    return jsonb_build_object('ok', false, 'error', 'attempt_limit_reached');
  end if;

  if p_code is null or p_code !~ '^[0-9]{8}$'
    or encode(extensions.digest(p_code || code_salt_value, 'sha256'), 'hex') <> code_hash_value then
    attempts_value := attempts_value + 1;
    update public.memory_transfers
    set attempts = attempts_value,
        status = case when attempts_value >= 5 then 'cancelled' else status end
    where id = transfer_id_value;
    return jsonb_build_object(
      'ok', false,
      'error', case when attempts_value >= 5 then 'attempt_limit_reached' else 'invalid_code' end,
      'attempts_remaining', greatest(0, 5 - attempts_value)
    );
  end if;

  select count(*) into item_count
  from public.transfer_items
  where transfer_id = transfer_id_value;
  if item_count < 1 then
    raise exception 'transfer_has_no_memories' using errcode = '55000';
  end if;

  update public.memory_transfers
  set status = 'completed', recipient_id = current_user_id, completed_at = now()
  where id = transfer_id_value and status = 'pending' and expires_at > now();
  if not found then
    return jsonb_build_object('ok', false, 'error', 'transfer_already_claimed');
  end if;

  update public.memory_entries as memory
  set owner_id = current_user_id, status = 'transferred', transferred_at = now()
  where memory.id in (
    select item.memory_id from public.transfer_items as item
    where item.transfer_id = transfer_id_value
  )
    and memory.owner_id = sender_id_value
    and memory.keyring_id = keyring_id_value
    and memory.status = 'draft';
  get diagnostics updated_count = row_count;
  if updated_count <> item_count then
    raise exception 'memory_ownership_changed' using errcode = '55000';
  end if;

  select string_agg(memory.text_content, ' ')
  into content_value
  from public.transfer_items as item
  join public.memory_entries as memory on memory.id = item.memory_id
  where item.transfer_id = transfer_id_value;

  region_kind := case
    when lower(coalesce(content_value, '')) ~ '(카페|커피|빵|차|라떼|cafe|coffee|bakery)' then 'cafe'
    when lower(coalesce(content_value, '')) ~ '(꽃|정원|화분|식물|garden|flower)' then 'garden'
    when lower(coalesce(content_value, '')) ~ '(공원|산책|하늘|바람|비|계절|park|walk|sky)' then 'park'
    else 'street'
  end;
  region_name := case region_kind
    when 'cafe' then '햇살 카페'
    when 'garden' then '작은 정원'
    when 'park' then '바람 공원'
    else '기억의 거리'
  end;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'memory_id', chosen.memory_id,
        'x', 2 + ((chosen.position - 1) % 4) * 3,
        'y', 2 + (((chosen.position - 1) / 4)::integer) * 3,
        'kind', case when memory.image_path is null then 'letter' else 'photo' end
      ) order by chosen.position
    ),
    '[]'::jsonb
  ) into object_data
  from (
    select item.memory_id, row_number() over (order by item.memory_id) as position
    from public.transfer_items as item
    where item.transfer_id = transfer_id_value
  ) as chosen
  join public.memory_entries as memory on memory.id = chosen.memory_id;

  insert into public.world_regions (owner_id, transfer_id, region_type, name, map_data)
  values (
    current_user_id,
    transfer_id_value,
    region_kind,
    region_name,
    jsonb_build_object(
      'version', 1,
      'template', region_kind,
      'grid', jsonb_build_object('columns', 16, 'rows', 12),
      'objects', object_data
    )
  ) returning id into region_id_value;

  return jsonb_build_object(
    'ok', true,
    'transfer_id', transfer_id_value,
    'region_id', region_id_value,
    'region_type', region_kind,
    'region_name', region_name,
    'memory_count', item_count
  );
end;
$$;

revoke all on function public.create_my_keyring() from public, anon;
revoke all on function public.get_public_keyring(text) from public, anon;
revoke all on function public.create_transfer_session(uuid, uuid[], text) from public, anon;
revoke all on function public.receive_transfer(text, text) from public, anon;
grant execute on function public.create_my_keyring() to authenticated;
grant execute on function public.get_public_keyring(text) to authenticated;
grant execute on function public.create_transfer_session(uuid, uuid[], text) to authenticated;
grant execute on function public.receive_transfer(text, text) to authenticated;
