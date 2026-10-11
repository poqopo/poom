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

  let body: { memory_id?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (typeof body.memory_id !== 'string') return json({ error: 'invalid_request' }, 400)

  const { data: memory, error: memoryError } = await client
    .from('memory_entries')
    .select('image_path')
    .eq('id', body.memory_id)
    .eq('owner_id', user.id)
    .maybeSingle()
  if (memoryError) return json({ error: 'photo_lookup_failed' }, 500)
  if (!memory?.image_path) return json({ error: 'photo_not_found' }, 404)

  const { data, error } = await client.storage
    .from('memory-photos')
    .createSignedUrl(memory.image_path, 60)
  if (error || !data?.signedUrl) return json({ error: 'photo_unavailable' }, 404)
  return json({ signed_url: data.signedUrl, expires_in: 60 })
})
