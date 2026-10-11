import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

export type AuthContextValue = {
  isLoading: boolean
  error: string | null
  session: Session | null
  user: User | null
}

export const AuthContext = createContext<AuthContextValue | null>(null)
