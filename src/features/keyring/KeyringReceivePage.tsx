import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AppShell, EmptyState, ErrorNotice, PageLoader } from '../../components/AppShell'
import { useAuth } from '../auth/useAuth'
import { activateKeyring, cancelTransfer, fetchKeyringState, receiveTransfer } from '../memories/api'

function remainingTime(expiresAt: string, now: number) {
  const seconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000))
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0')
}

export function KeyringReceivePage({ publicId }: { publicId: string }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [message, setMessage] = useState('')
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const stateQuery = useQuery({
    queryKey: ['keyring-state', publicId],
    queryFn: () => fetchKeyringState(publicId),
    retry: false,
    refetchInterval: 10_000,
  })
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['keyring-state', publicId] })
    if (user) await queryClient.invalidateQueries({ queryKey: ['keyrings', user.id] })
  }
  const activate = useMutation({
    mutationFn: () => activateKeyring(publicId),
    onSuccess: async (result) => {
      if (!result.ok) {
        setMessage(result.error === 'keyring_not_available' ? '이미 다른 사용자가 활성화했거나 사용할 수 없는 키링이에요.' : '키링을 활성화하지 못했어요.')
      } else {
        setMessage('키링이 활성화되어 이 계정에 등록됐어요. 이제 이 키링에 추억을 모을 수 있어요.')
      }
      await refresh()
    },
    onError: () => setMessage('키링을 활성화하지 못했습니다. 연결을 확인하고 다시 시도해주세요.'),
  })
  const receive = useMutation({
    mutationFn: () => receiveTransfer(publicId),
    onSuccess: async (result) => {
      if (!result.ok) {
        const errors: Record<string, string> = {
          keyring_not_found: '키링 주소를 찾을 수 없습니다.',
          keyring_already_transferred: '이미 마음이 전해진 키링이에요.',
          no_pending_transfer: '아직 전달 준비가 되지 않았거나 유효 시간이 끝났어요.',
          cannot_receive_own_transfer: '내가 활성화한 키링은 다른 계정에서 받아야 해요.',
          transfer_already_claimed: '이미 다른 사용자가 받았어요.',
          transfer_expired: '전달 준비 시간이 만료됐어요.',
        }
        setMessage(errors[result.error ?? ''] ?? '추억을 받지 못했습니다. 다시 시도해주세요.')
        await refresh()
        return
      }
      if (user) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['world', user.id] }),
          queryClient.invalidateQueries({ queryKey: ['memories', user.id] }),
          queryClient.invalidateQueries({ queryKey: ['keyrings', user.id] }),
        ])
      }
      await queryClient.invalidateQueries({ queryKey: ['keyring-state', publicId] })
      navigate('/world', { replace: true })
    },
    onError: () => setMessage('연결이 불안정해 전달을 완료하지 못했어요. 키링을 다시 태그해 확인해주세요.'),
  })
  const cancel = useMutation({
    mutationFn: () => cancelTransfer(publicId),
    onSuccess: async (result) => {
      setMessage(result.ok ? '전달 준비를 취소했어요. 추억은 키링에 그대로 남아 있어요.' : '전달 준비를 취소하지 못했어요.')
      await refresh()
    },
    onError: () => setMessage('전달 준비를 취소하지 못했어요. 다시 시도해주세요.'),
  })

  if (stateQuery.isPending) return <AppShell title="키링" backTo="/home"><PageLoader label="추억상자 상태를 확인하고 있어요." /></AppShell>
  if (stateQuery.isError) return <AppShell title="키링" backTo="/home"><ErrorNotice>키링을 확인하지 못했습니다. 주소를 다시 확인해주세요.</ErrorNotice></AppShell>
  const state = stateQuery.data
  if (!state?.exists) return <AppShell title="키링" backTo="/home"><EmptyState title="키링을 찾지 못했어요" body="주소를 다시 확인해주세요." /></AppShell>

  return (
    <AppShell title="Poom 추억상자" backTo="/home">
      {state.status === 'unpaired' && (
        <section className="app-card p-4">
          <p className="app-eyebrow">첫 태그 · 키링 활성화</p>
          <h1 className="mt-2 text-xl font-bold text-ink">이 키링을 내 추억상자로 만들까요?</h1>
          <p className="app-body-copy mt-2">활성화를 누르면 이 기기의 익명 계정이 키링 소유자가 됩니다. 활성화 후에는 다른 사람이 소유권을 가져갈 수 없어요.</p>
          <button className="app-primary-button mt-4 w-full" disabled={activate.isPending} onClick={() => { setMessage(''); activate.mutate() }} type="button">
            {activate.isPending ? '키링을 활성화하고 있어요…' : '키링 활성화하기'}
          </button>
          {message && <ErrorNotice>{message}</ErrorNotice>}
          <p className="mt-3 text-xs leading-5 text-ink-subtle">키링 URL이 전달되면 URL을 가진 사람도 먼저 활성화할 수 있으니, 실물 키링을 받은 뒤 활성화해주세요.</p>
        </section>
      )}

      {state.status === 'active' && state.is_owner && (
        <>
          <section className="app-hero">
            <p className="app-eyebrow">{state.name ?? '나의 추억 키링'}</p>
            <h1>소중한 사람이<br />생각났나요?</h1>
            <p className="app-body-copy mt-2">이 키링에 추억을 차곡차곡 담았다가 직접 만나는 날 건네요.</p>
          </section>
          <div className="mt-3 grid gap-2">
            <Link className="app-primary-button w-full" to={'/k/' + publicId + '/new'}>✦ 추억 남기기</Link>
            <Link className="app-secondary-action w-full" to={'/k/' + publicId + '/memories'}>지금까지 담은 추억 보기{typeof state.memory_count === 'number' ? ' · ' + state.memory_count + '개' : ''}</Link>
            <Link aria-disabled={!state.memory_count} className={'app-secondary-action w-full' + (state.memory_count ? '' : ' pointer-events-none opacity-50')} to={'/k/' + publicId + '/transfer'}>추억 전달하기</Link>
          </div>
          {message && <p className="mt-3 text-center text-sm text-ink-muted">{message}</p>}
        </>
      )}
      {state.status === 'active' && !state.is_owner && <EmptyState title="아직 전달할 준비가 되지 않은 키링이에요." body="이 키링은 이미 다른 사용자가 활성화했어요. 소유자의 전달 준비가 끝나면 다시 태그해주세요." />}

      {state.status === 'transfer_ready' && state.is_owner && (
        <section className="app-card border-orange-200 bg-orange-50/85 p-4">
          <p className="app-eyebrow">전달 대기 · 추억 {state.memory_count ?? 0}개</p>
          <h1 className="mt-2 text-xl font-bold text-ink">전달할 준비가 되었어요</h1>
          <p className="app-body-copy mt-2">키링을 건네고 상대방이 태그해 받기를 확인할 때까지 기다려주세요.</p>
          {state.transfer_expires_at && <p className="mt-4 text-center font-mono text-2xl font-bold text-orange-700">{remainingTime(state.transfer_expires_at, now)}</p>}
          <button className="app-danger-button mt-4 w-full" disabled={cancel.isPending} onClick={() => cancel.mutate()} type="button">전달 준비 취소</button>
          {message && <p className="mt-3 text-center text-sm text-ink-muted">{message}</p>}
        </section>
      )}
      {state.status === 'transfer_ready' && !state.is_owner && (
        <section className="app-card p-4">
          <p className="app-eyebrow">Poom · NFC 추억상자</p>
          <h1 className="mt-2 text-xl font-bold text-ink">누군가의 마음이 도착했어요</h1>
          <p className="app-body-copy mt-2">받기를 누르면 이 키링에 담긴 모든 추억이 내 세계로 옮겨지고, 키링은 다시 사용할 수 없게 됩니다.</p>
          <button className="app-primary-button mt-4 w-full" disabled={receive.isPending} onClick={() => { setMessage(''); receive.mutate() }} type="button">
            {receive.isPending ? '추억을 받고 있어요…' : '확인 · 추억 받기'}
          </button>
          {message && <ErrorNotice>{message}</ErrorNotice>}
          <p className="mt-4 text-xs leading-5 text-ink-subtle">NFC URL은 대면 전달을 돕지만 실제 만남 자체를 암호학적으로 증명하지는 않습니다.</p>
        </section>
      )}
      {state.status === 'transferred' && <EmptyState title="이미 마음이 전해진 키링이에요." body="이 키링은 한 번 전달된 뒤 사용이 종료됐어요. 받은 추억은 수령자의 세계에 계속 보관됩니다." action={state.is_owner ? <Link className="app-primary-button mt-4" to="/world">내 추억의 세계 보기</Link> : undefined} />}
    </AppShell>
  )
}
