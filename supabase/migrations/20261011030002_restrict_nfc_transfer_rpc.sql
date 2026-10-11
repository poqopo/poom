-- Functions created in an upgrade migration inherit PostgreSQL's PUBLIC execute default.
-- Restrict the NFC state-transition RPCs to authenticated JWT callers.
revoke all on function public.prepare_keyring_transfer(text, text) from public, anon, authenticated;
grant execute on function public.prepare_keyring_transfer(text, text) to authenticated;
