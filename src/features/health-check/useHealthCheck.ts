import { useQuery } from '@tanstack/react-query'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import type { HealthCheckResponse } from '../../types/healthCheck'

export function useHealthCheck() {
  return useQuery({
    queryKey: ['health-check'],
    enabled: isSupabaseConfigured,
    queryFn: async (): Promise<HealthCheckResponse> => {
      if (!supabase) {
        throw new Error('Supabase 환경변수를 먼저 설정해주세요.')
      }

      const { data, error } = await supabase.functions.invoke<HealthCheckResponse>(
        'health-check',
      )

      if (error) throw error
      if (!data) throw new Error('health-check 함수가 빈 응답을 반환했습니다.')
      return data
    },
  })
}
