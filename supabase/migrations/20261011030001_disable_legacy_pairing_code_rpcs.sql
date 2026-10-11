-- Remove the retired pairing and transfer-code RPC path from client roles.
revoke all on function public.rotate_keyring_pairing_code(text) from public, anon, authenticated;
revoke all on function public.pair_keyring(text, text) from public, anon, authenticated;
revoke all on function public.reissue_keyring_transfer(text) from public, anon, authenticated;
revoke all on function public.cancel_keyring_transfer(text) from public, anon, authenticated;
