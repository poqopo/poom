update public.keyrings
set paired_at = coalesce(paired_at, created_at)
where owner_id is not null
  and status in ('active', 'pending_transfer', 'transferred')
  and paired_at is null;
