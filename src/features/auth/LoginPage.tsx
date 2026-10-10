import { useState } from 'react'
import { Brand } from '../../components/Brand'
import { supabase } from '../../lib/supabase'

export function LoginPage() {
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleKakaoLogin() {
    setErrorMessage('')
    if (!supabase) {
      setErrorMessage('Supabase 연결 설정을 확인해주세요.')
      return
    }

    setIsSubmitting(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'kakao',
        options: { redirectTo: new URL('/', window.location.origin).toString() },
      })

      if (error) {
        setErrorMessage('카카오 로그인에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.')
      }
    } catch {
      setErrorMessage('카카오 로그인에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="login-scene login-screen relative flex min-h-[100dvh] items-center justify-center overflow-x-hidden px-4 py-4">
      <div aria-hidden="true" className="decor-orb decor-orb--one" />
      <div aria-hidden="true" className="decor-orb decor-orb--two" />
      <div className="login-layout relative z-10 grid w-full items-center">
        <section className="login-intro mx-auto text-center">
          <Brand />
          <h1 className="login-slogan mt-4 font-bold tracking-[-0.04em] text-ink">
            가장 빠르게 연결되는 시대에,
            <br className="hidden sm:block" />
            우리는 가장 느린 연결을 만듭니다.
          </h1>
          <p className="login-description mx-auto mt-2 text-ink-muted">
            문득 떠오른 마음을 모아두었다가, 직접 만나는 날 천천히 건네요.
          </p>
        </section>

        <section aria-labelledby="login-title" className="login-card glass-card glass-card--strong mx-auto w-full rounded-[28px] p-6">
          <div className="login-card-heading mb-5">
            <p className="text-sm font-semibold text-orange-700">다시 만났네요</p>
            <h2 id="login-title" className="mt-2 text-2xl font-bold text-ink">로그인</h2>
            <p className="mt-1 text-sm leading-6 text-ink-muted">카카오 계정으로 추억 상자를 열어보세요.</p>
          </div>
          {errorMessage && <p className="mb-4 rounded-control bg-red-50 px-4 py-3 text-sm leading-6 text-danger" role="alert">{errorMessage}</p>}
          <button
            aria-label="카카오 로그인"
            aria-busy={isSubmitting}
            className="kakao-login-button flex min-h-11 w-full items-center justify-center rounded-xl bg-[#FEE500] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-wait"
            disabled={isSubmitting}
            onClick={() => void handleKakaoLogin()}
            type="button"
          >
            <img alt="" height="46" src="/kakao-login.svg" width="224" />
          </button>
        </section>
      </div>
    </main>
  )
}
