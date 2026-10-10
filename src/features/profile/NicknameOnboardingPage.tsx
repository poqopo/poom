import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Brand } from '../../components/Brand'
import { useAuth } from '../auth/useAuth'
import { homeSummaryQueryKey } from '../home/useHomeSummary'
import { completeProfileOnboarding } from './api'
import { profileQueryKey } from './useProfile'

const nicknamePattern = /^[가-힣A-Za-z0-9]+$/u

function suggestedNickname(metadata: Record<string, unknown>) {
  const value = [metadata.nickname, metadata.full_name, metadata.name]
    .find((item): item is string => typeof item === 'string' && item.trim().length > 0)

  return value?.trim().replace(/[^가-힣A-Za-z0-9]/gu, '').slice(0, 12) ?? ''
}

export function NicknameOnboardingPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const query = useQueryClient()
  const [nickname, setNickname] = useState(() => suggestedNickname(user?.user_metadata ?? {}))
  const [errorMessage, setErrorMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')

    const displayName = nickname.trim()
    const length = Array.from(displayName).length
    if (length < 2 || length > 12 || !nicknamePattern.test(displayName)) {
      setErrorMessage('닉네임은 한글, 영문, 숫자로 2~12자 입력해주세요.')
      return
    }
    if (!user) {
      setErrorMessage('로그인 정보를 확인할 수 없습니다. 다시 로그인해주세요.')
      return
    }

    setIsSaving(true)
    try {
      await completeProfileOnboarding(displayName)
      await query.invalidateQueries({ queryKey: profileQueryKey(user.id) })
      await query.invalidateQueries({ queryKey: homeSummaryQueryKey(user.id) })
      navigate('/home', { replace: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      setErrorMessage(message.includes('invalid_display_name')
        ? '닉네임은 한글, 영문, 숫자로 2~12자 입력해주세요.'
        : '닉네임을 저장하지 못했습니다. 다시 시도해주세요.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="login-scene login-screen onboarding-screen relative flex min-h-[100dvh] items-center justify-center overflow-x-hidden px-4 py-4">
      <div aria-hidden="true" className="decor-orb decor-orb--one" />
      <div aria-hidden="true" className="decor-orb decor-orb--two" />
      <div className="login-layout onboarding-layout relative z-10 grid w-full items-center">
        <section className="login-intro mx-auto text-center">
          <Brand />
          <h1 id="nickname-title" className="login-slogan mt-4 font-bold tracking-[-0.04em] text-ink">
            어떻게 불러드리면 될까요?
          </h1>
          <p className="login-description mx-auto mt-2 text-ink-muted">
            우리의 작은 세계에서 사용할 이름을 알려주세요.
          </p>
        </section>

        <section aria-labelledby="nickname-title" className="login-card glass-card glass-card--strong mx-auto w-full rounded-[28px] p-6">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-2 block text-sm font-semibold text-ink" htmlFor="nickname">닉네임</label>
              <input
                autoComplete="nickname"
                className="min-h-12 w-full rounded-control border border-line-strong bg-surface px-4 text-base text-ink outline-none transition placeholder:text-ink-subtle/80 focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
                id="nickname"
                maxLength={12}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="닉네임을 입력해주세요"
                required
                value={nickname}
              />
            </div>
            {errorMessage && <p className="rounded-control bg-red-50 px-4 py-3 text-sm leading-6 text-danger" role="alert">{errorMessage}</p>}
            <button
              aria-busy={isSaving}
              className="min-h-[52px] w-full rounded-control bg-orange-600 px-5 text-[15px] font-semibold text-white shadow-soft transition hover:bg-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-wait disabled:opacity-70"
              disabled={isSaving}
              type="submit"
            >
              {isSaving ? '저장 중…' : '시작하기'}
            </button>
          </form>
          <p className="mt-4 text-center text-xs leading-5 text-ink-subtle">다른 사람과 같은 닉네임을 사용해도 괜찮아요.</p>
        </section>
      </div>
    </main>
  )
}
