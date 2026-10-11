import { useEffect, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'
import type { Session } from '@supabase/supabase-js'
import { queryClient } from '../../lib/queryClient'
import { supabase } from '../../lib/supabase'
import { AuthContext } from './authContext'
import type { AuthContextValue } from './authContext'

let sessionPromise: Promise<Session> | null = null

function ensureSession() {
  if (!supabase) return Promise.reject(new Error('Supabase 환경 설정을 확인해주세요.'))
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const { data, error } = await supabase.auth.getSession()
      if (error) throw error
      if (data.session) return data.session

      const { data: anonymousData, error: anonymousError } = await supabase.auth.signInAnonymously()
      if (anonymousError) throw anonymousError
      if (!anonymousData.session) throw new Error('익명 세션을 만들지 못했습니다.')
      return anonymousData.session
    })().catch((error: unknown) => {
      sessionPromise = null
      throw error
    })
  }
  return sessionPromise
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [isReady, setIsReady] = useState(!supabase)
  const [error, setError] = useState<string | null>(supabase ? null : 'Supabase 환경 설정을 확인해주세요.')
  const isLoading = !isReady

  useEffect(() => {
    let mounted = true
    let activeUserId: string | null = null
    if (!supabase) return

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const nextUserId = nextSession?.user.id ?? null
      if (activeUserId !== nextUserId) queryClient.clear()
      activeUserId = nextUserId
      setSession(nextSession)
    })

    void ensureSession()
      .then((nextSession) => {
        if (!mounted) return
        activeUserId = nextSession.user.id
        setSession(nextSession)
        setError(null)
        setIsReady(true)
      })
      .catch((sessionError: unknown) => {
        if (!mounted) return
        setSession(null)
        setError(sessionError instanceof Error ? sessionError.message : '익명 세션을 시작하지 못했습니다.')
        setIsReady(true)
      })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    isLoading,
    error,
    session,
    user: session?.user ?? null,
  }), [error, isLoading, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
