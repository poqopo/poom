-- NFC lifecycle: unpaired (inactive) -> active (claimed by first scanner)
-- -> transfer_ready -> transferred after the receiver confirms on the tagged URL.
-- Existing rows and transfer snapshots are retained.
alter table public.keyrings drop constraint if exists keyrings_status_check;
alter table public.keyrings add constraint keyrings_status_check
  check (status in ('unpaired', 'active', 'pending_transfer', 'transfer_ready', 'transferred'));
update public.keyrings set status = 'transfer_ready' where status = 'pending_transfer';

create or replace function public.admin_create_unpaired_keyring(p_name text default 'Poom 키링')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare issued jsonb;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  issued := public.create_unpaired_keyring(p_name);
  return issued - 'pairing_code' - 'pairing_expires_at';
end;
$$;

create or replace function public.activate_keyring(p_public_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  keyring public.keyrings;
begin
  if current_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into keyring from public.keyrings where public_id = p_public_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'keyring_not_found'); end if;
  if keyring.status <> 'unpaired' or keyring.owner_id is not null then
    return jsonb_build_object('ok', false, 'error', 'keyring_not_available');
  end if;
  update public.keyrings set owner_id = current_user_id, status = 'active', paired_at = now(),
    pairing_code_hash = null, pairing_code_salt = null, pairing_attempts = 0, pairing_expires_at = null
  where id = keyring.id;
  return jsonb_build_object('ok', true, 'id', keyring.id, 'status', 'active');
end;
$$;

alter function public.prepare_keyring_transfer(text, text) rename to prepare_keyring_transfer_legacy;
create or replace function public.prepare_keyring_transfer(p_public_id text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  keyring public.keyrings;
  existing_transfer public.memory_transfers;
  result jsonb;
  memory_count integer;
begin
  if current_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into keyring from public.keyrings where public_id = p_public_id and owner_id = current_user_id for update;
  if not found then raise exception 'keyring_not_owned' using errcode = '42501'; end if;

  if keyring.status = 'transfer_ready' then
    select * into existing_transfer from public.memory_transfers
      where keyring_id = keyring.id and status = 'pending' for update;
    if existing_transfer.id is not null and existing_transfer.expires_at > now() then
      select count(*)::integer into memory_count from public.transfer_items where transfer_id = existing_transfer.id;
      return jsonb_build_object('transfer_id', existing_transfer.id, 'expires_at', existing_transfer.expires_at,
        'memory_count', memory_count, 'status', 'transfer_ready', 'reused', true);
    end if;
    if existing_transfer.id is not null then update public.memory_transfers set status = 'expired' where id = existing_transfer.id; end if;
    update public.keyrings set status = 'active' where id = keyring.id;
  end if;

  result := public.prepare_keyring_transfer_legacy(p_public_id, p_idempotency_key);
  update public.keyrings set status = 'transfer_ready' where id = keyring.id and status = 'pending_transfer';
  return (result - 'code') || jsonb_build_object('status', 'transfer_ready');
end;
$$;

create or replace function public.cancel_keyring_transfer_ready(p_public_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_user_id uuid := auth.uid(); keyring_id_value uuid;
begin
  if current_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select id into keyring_id_value from public.keyrings
    where public_id = p_public_id and owner_id = current_user_id and status = 'transfer_ready' for update;
  if keyring_id_value is null then return jsonb_build_object('ok', false, 'error', 'transfer_not_cancellable'); end if;
  update public.memory_transfers set status = 'cancelled'
    where keyring_id = keyring_id_value and status = 'pending';
  update public.keyrings set status = 'active' where id = keyring_id_value;
  return jsonb_build_object('ok', true, 'status', 'active');
end;
$$;

create or replace function public.get_keyring_state(p_public_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  keyring public.keyrings;
  transfer public.memory_transfers;
  item_count integer;
begin
  if current_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into keyring from public.keyrings where public_id = p_public_id for update;
  if not found then return jsonb_build_object('exists', false); end if;

  if keyring.status in ('transfer_ready', 'pending_transfer') then
    select * into transfer from public.memory_transfers
      where keyring_id = keyring.id and status = 'pending' for update;
    if transfer.id is null or transfer.expires_at <= now() then
      if transfer.id is not null then update public.memory_transfers set status = 'expired' where id = transfer.id; end if;
      update public.keyrings set status = 'active' where id = keyring.id;
      keyring.status := 'active';
    else
      keyring.status := 'transfer_ready';
    end if;
  end if;

  if keyring.owner_id = current_user_id then
    select count(*)::integer into item_count from public.memory_entries
      where keyring_id = keyring.id and owner_id = current_user_id;
  end if;
  return jsonb_build_object(
    'exists', true, 'id', keyring.id, 'public_id', keyring.public_id, 'status', keyring.status,
    'is_owner', keyring.owner_id = current_user_id,
    'is_creator', false,
    'name', case when keyring.owner_id = current_user_id then keyring.name else null end,
    'memory_count', case when keyring.owner_id = current_user_id then coalesce(item_count, 0) else null end,
    'transfer_id', case when keyring.status = 'transfer_ready' and keyring.owner_id = current_user_id then transfer.id else null end,
    'transfer_expires_at', case when keyring.status = 'transfer_ready' then transfer.expires_at else null end
  );
end;
$$;

create or replace function public.receive_transfer(p_public_id text, p_code text default null)
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
  if p_code is not null and transfer.attempts >= 5 then
    update public.memory_transfers set status = 'cancelled' where id = transfer.id;
    update public.keyrings set status = 'active' where id = keyring.id;
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'attempt_limit_reached');
  end if;

  if p_code is not null and (
    p_code !~ '^[0-9]{8}$'
    or pg_catalog.encode(
      extensions.digest(p_code || transfer.code_salt, 'sha256'),
      'hex'
    ) <> transfer.code_hash
  ) then
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
-- Allow the current owner to inspect memories while a transfer awaits receiver confirmation.
drop policy if exists "Users can read their own keyring memories" on public.memory_entries;
create policy "Users can read their own keyring memories" on public.memory_entries for select to authenticated
using (owner_id = (select auth.uid()) and (keyring_id is null or exists (
  select 1 from public.keyrings as keyring where keyring.id = memory_entries.keyring_id
    and keyring.owner_id = (select auth.uid()) and keyring.status in ('active', 'transfer_ready', 'pending_transfer', 'transferred')
)));

drop policy if exists "Owners can read private keyring photos" on storage.objects;
create policy "Owners can read private keyring photos" on storage.objects for select to authenticated
using (bucket_id = 'memory-photos' and exists (
  select 1 from public.memory_entries as memory left join public.keyrings as keyring on keyring.id = memory.keyring_id
  where memory.image_path = storage.objects.name and memory.owner_id = (select auth.uid())
    and (memory.keyring_id is null or (keyring.owner_id = (select auth.uid())
      and keyring.status in ('active', 'transfer_ready', 'pending_transfer', 'transferred')))
));

revoke all on function public.activate_keyring(text) from public, anon, authenticated;
revoke all on function public.cancel_keyring_transfer_ready(text) from public, anon, authenticated;
revoke all on function public.prepare_keyring_transfer_legacy(text, text) from public, anon, authenticated;
grant execute on function public.activate_keyring(text) to authenticated;
grant execute on function public.cancel_keyring_transfer_ready(text) to authenticated;
grant execute on function public.prepare_keyring_transfer(text, text) to authenticated;
