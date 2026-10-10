import { supabase } from '../../lib/supabase'

export type RecentMemoryEntry = {
  id: string
  text_content: string
  image_path: string | null
  status: 'draft' | 'transferred'
  created_at: string
}

export type HomeSummary = {
  user_id: string
  display_name: string
  pending_memory_count: number
  recent_memories: RecentMemoryEntry[]
}

export async function fetchHomeSummary(): Promise<HomeSummary> {
  if (!supabase) throw new Error('Supabase 환경 설정을 확인해주세요.')
  const { data, error } = await supabase.functions.invoke<HomeSummary>('home-summary')
  if (error) throw error
  if (!data) throw new Error('홈 정보를 불러오지 못했습니다.')
  return data
}
