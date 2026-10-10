import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './features/auth/useAuth'
import { LoginPage } from './features/auth/LoginPage'
import { HomePage } from './features/home/HomePage'
import { NicknameOnboardingPage } from './features/profile/NicknameOnboardingPage'
import type { Profile } from './features/profile/api'
import { useProfile } from './features/profile/useProfile'

function SessionLoading() {
  return (
    <main className="grid min-h-[100dvh] place-items-center px-6 text-ink-muted">
      <div className="text-center" role="status">
        <span className="mx-auto block size-8 animate-spin rounded-full border-2 border-orange-200 border-t-orange-700" />
        <p className="mt-4 text-sm">로그인 상태를 확인하고 있어요.</p>
      </div>
    </main>
  )
}

function LoginRoute() {
  const { isLoading, user } = useAuth()
  if (isLoading) return <SessionLoading />
  return user ? <Navigate replace to="/home" /> : <LoginPage />
}

function ProfileError({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="grid min-h-[100dvh] place-items-center px-5 text-ink-muted">
      <section className="glass-card glass-card--strong w-full max-w-[430px] rounded-[24px] p-6 text-center">
        <h1 className="text-lg font-bold text-ink">프로필을 불러오지 못했어요.</h1>
        <p className="mt-2 text-sm leading-6">네트워크를 확인한 뒤 다시 시도해주세요.</p>
        <button className="mt-5 min-h-11 rounded-control bg-orange-600 px-5 text-sm font-semibold text-white" onClick={onRetry} type="button">다시 시도</button>
      </section>
    </main>
  )
}

function ProfileGate({
  onboardingRequired,
  children,
}: {
  onboardingRequired: boolean
  children: (profile: Profile | null) => ReactNode
}) {
  const { isLoading, user } = useAuth()
  const profile = useProfile(user?.id ?? '')

  if (isLoading) return <SessionLoading />
  if (!user) return <Navigate replace to="/login" />
  if (profile.isPending) return <SessionLoading />
  if (profile.isError) return <ProfileError onRetry={() => void profile.refetch()} />

  const isOnboardingComplete = Boolean(
    profile.data?.onboarding_completed && profile.data.display_name?.trim(),
  )

  if (onboardingRequired && isOnboardingComplete) return <Navigate replace to="/home" />
  if (!onboardingRequired && !isOnboardingComplete) return <Navigate replace to="/onboarding" />
  return <>{children(profile.data ?? null)}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/onboarding" element={<ProfileGate onboardingRequired>{() => <NicknameOnboardingPage />}</ProfileGate>} />
      <Route path="/home" element={<ProfileGate onboardingRequired={false}>{(profile) => <HomePage displayName={profile?.display_name ?? ''} />}</ProfileGate>} />
      <Route path="/" element={<Navigate replace to="/home" />} />
      <Route path="*" element={<Navigate replace to="/home" />} />
    </Routes>
  )
}
