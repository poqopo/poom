import { useQuery } from '@tanstack/react-query'
import { fetchHomeSummary } from './api'

export const homeSummaryQueryKey = (userId: string) => ['home-summary', userId] as const

export function useHomeSummary(userId: string) {
  return useQuery({
    queryKey: homeSummaryQueryKey(userId),
    queryFn: fetchHomeSummary,
    enabled: Boolean(userId),
  })
}
