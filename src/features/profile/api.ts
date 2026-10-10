import { supabase } from '../../lib/supabase'

export type Profile = {
  id: string
  email: string | null
  display_name: string | null
  onboarding_completed: boolean
  created_at: string
  updated_at: string
}

export async function fetchProfile(expectedUserId: string): Promise<Profile | null> {
  if (!supabase) throw new Error('Supabase 환경 설정을 확인해주세요.')

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('로그인 정보를 확인할 수 없습니다.')
  if (user.id !== expectedUserId) throw new Error('현재 로그인 사용자 정보가 변경되었습니다.')

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, display_name, onboarding_completed, created_at, updated_at')
    .eq('id', user.id)
    .maybeSingle()

  if (error) throw error
  return data as Profile | null
}

export async function completeProfileOnboarding(displayName: string) {
  if (!supabase) throw new Error('Supabase 환경 설정을 확인해주세요.')

  const { error } = await supabase.rpc('complete_profile_onboarding', {
    p_display_name: displayName,
  })
  if (error) throw error
}
