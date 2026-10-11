revoke select on table public.keyrings from authenticated;
grant select (
  id,
  owner_id,
  created_by_id,
  public_id,
  name,
  status,
  created_at,
  paired_at,
  transferred_at
) on table public.keyrings to authenticated;
