import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

function getPublishableKey() {
  const directKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
  if (directKey) return directKey
  const keyNames = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')
  if (keyNames) {
    try {
      const parsed: unknown = JSON.parse(keyNames)
      if (parsed && typeof parsed === 'object' && 'default' in parsed
        && typeof parsed.default === 'string') {
        return Deno.env.get(parsed.default) ?? ''
      }
    } catch {
      return ''
    }
  }
  return Deno.env.get('SUPABASE_ANON_KEY') ?? ''
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const token = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return json({ error: 'unauthorized' }, 401)
  const url = Deno.env.get('SUPABASE_URL') ?? new URL(request.url).origin
  const key = request.headers.get('apikey') ?? getPublishableKey()
  if (!url || !key) return json({ error: 'service_configuration_error' }, 500)

  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: authError } = await client.auth.getUser(token)
  if (authError || !user) return json({ error: 'unauthorized' }, 401)

  let body: { public_id?: unknown; idempotency_key?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (typeof body.public_id !== 'string' || typeof body.idempotency_key !== 'string') {
    return json({ error: 'invalid_request' }, 400)
  }

  const { data, error } = await client.rpc('prepare_keyring_transfer', {
    p_public_id: body.public_id,
    p_idempotency_key: body.idempotency_key,
  })
  if (error) {
    const message = error.message
    if (message.includes('keyring_has_pending_transfer')) {
      return json({ error: 'keyring_has_pending_transfer' }, 409)
    }
    if (message.includes('keyring_not_owned')) {
      return json({ error: 'keyring_not_owned' }, 403)
    }
    if (message.includes('keyring_has_no_memories')) return json({ error: 'keyring_has_no_memories' }, 409)
    if (message.includes('keyring_not_active')) return json({ error: 'keyring_not_active' }, 409)
    if (message.includes('idempotency_key_already_used')) return json({ error: 'idempotency_key_already_used' }, 409)
    if (message.includes('keyring_has_pending_photo_upload')) return json({ error: 'keyring_has_pending_photo_upload' }, 409)
    return json({ error: 'transfer_creation_failed' }, 400)
  }
  return json(data)
})
