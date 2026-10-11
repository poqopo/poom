import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell, ErrorNotice } from '../../components/AppShell'
import { supabase } from '../../lib/supabase'
import { useAuth } from './useAuth'

export function LoginPage() {
  const { user } = useAuth()
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const kakaoAlreadyLinked = user?.identities?.some((identity) => identity.provider === 'kakao') ?? false

  async function linkKakaoAccount() {
    if (!supabase || !user) {
      setErrorMessage('현재 기기의 세션을 확인할 수 없습니다.')
      return
    }
    setErrorMessage('')
    setIsSubmitting(true)
    try {
      const { error } = await supabase.auth.linkIdentity({
        provider: 'kakao',
        options: { redirectTo: new URL('/home', window.location.origin).toString() },
      })
      if (error) setErrorMessage('카카오 계정을 연결하지 못했습니다. 기존 계정에 연결된 카카오 계정인지 확인해주세요.')
    } catch {
      setErrorMessage('카카오 계정을 연결하지 못했습니다. 네트워크를 확인해주세요.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AppShell title="추억 보관 이어가기" backTo="/home">
      <section className="app-hero">
        <p className="app-eyebrow">선택 사항</p>
        <h2>내 추억을<br />계속 보관할까요?</h2>
        <p className="app-body-copy mt-2">카카오 계정을 연결하면 이 기기의 추억을 계정에 이어둘 수 있어요. 로그인은 필수가 아닙니다.</p>
      </section>
      <section className="app-card mt-3 p-4">
        {kakaoAlreadyLinked ? (
          <>
            <p className="font-semibold text-ink">카카오 계정이 이미 연결되어 있어요.</p>
            <p className="app-body-copy mt-2">이 계정의 사용자 ID와 추억이 유지됩니다.</p>
          </>
        ) : (
          <>
            <p className="app-body-copy">연결을 시작하면 기존 Poom 사용자 ID를 유지한 채 카카오 인증을 진행합니다. 이미 다른 Poom 계정에 연결된 카카오는 자동 병합하지 않습니다.</p>
            <button className="app-primary-button mt-4 w-full" disabled={isSubmitting} onClick={() => void linkKakaoAccount()} type="button">
              {isSubmitting ? '카카오로 이동하고 있어요…' : '카카오 계정 연결하기'}
            </button>
          </>
        )}
        {errorMessage && <ErrorNotice>{errorMessage}</ErrorNotice>}
        <Link className="mt-3 block py-2 text-center text-sm font-semibold text-orange-700" to="/home">지금은 건너뛰기</Link>
      </section>
    </AppShell>
  )
}
