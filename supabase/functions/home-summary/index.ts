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
      if (parsed && typeof parsed === 'object' && 'default' in parsed) {
        const keyName = parsed.default
        if (typeof keyName === 'string') {
          const key = Deno.env.get(keyName)
          if (key) return key
        }
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

  const authorization = request.headers.get('Authorization')
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return json({ error: 'unauthorized' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const publishableKey = getPublishableKey()
  if (!supabaseUrl || !publishableKey) {
    return json({ error: 'service_configuration_error' }, 500)
  }

  const supabase = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return json({ error: 'unauthorized' }, 401)

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('display_name, onboarding_completed')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) return json({ error: 'home_summary_unavailable' }, 500)
  if (!profile?.onboarding_completed || !profile.display_name?.trim()) {
    return json({ error: 'onboarding_required' }, 403)
  }

  const [countResult, recentResult] = await Promise.all([
    supabase.from('memory_entries').select('id', { count: 'exact', head: true })
      .eq('owner_id', user.id).eq('status', 'draft'),
    supabase.from('memory_entries')
      .select('id, text_content, image_path, status, created_at')
      .eq('owner_id', user.id).eq('status', 'draft')
      .order('created_at', { ascending: false }).limit(2),
  ])

  if (countResult.error || recentResult.error) {
    return json({ error: 'home_summary_unavailable' }, 500)
  }

  return json({
    user_id: user.id,
    display_name: profile.display_name,
    pending_memory_count: countResult.count ?? 0,
    recent_memories: recentResult.data ?? [],
  })
})
