import { useQuery } from '@tanstack/react-query'
import { fetchProfile } from './api'

export const profileQueryKey = (userId: string) => ['profile', userId] as const

export function useProfile(userId: string) {
  return useQuery({
    queryKey: profileQueryKey(userId),
    queryFn: () => fetchProfile(userId),
    enabled: Boolean(userId),
  })
}
