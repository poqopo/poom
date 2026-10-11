import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AppShell, ErrorNotice, PageLoader } from '../../components/AppShell'
import { useAuth } from '../auth/useAuth'
import { cancelTransfer, createTransfer, fetchKeyringState } from '../memories/api'

export function KeyringTransferPage({ publicId }: { publicId: string }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [message, setMessage] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID() + '-keyring')
  const state = useQuery({ queryKey: ['keyring-state', publicId], queryFn: () => fetchKeyringState(publicId) })
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['keyring-state', publicId] })
    if (user) await queryClient.invalidateQueries({ queryKey: ['keyrings', user.id] })
  }
  const prepare = useMutation({
    mutationFn: () => createTransfer({ publicId, idempotencyKey }),
    onSuccess: async () => {
      setIdempotencyKey(crypto.randomUUID() + '-keyring')
      setMessage('이 키링의 추억을 받을 수 있도록 준비했어요. 상대방이 같은 키링을 태그하고 확인하면 이전됩니다.')
      await refresh()
    },
    onError: (error: unknown) => {
      const reason = error instanceof Error ? error.message : ''
      setMessage(reason.includes('keyring_has_no_memories') ? '먼저 이 키링에 추억을 남겨주세요.' : '전달 준비를 시작하지 못했습니다. 키링 상태를 새로 확인해주세요.')
      void refresh()
    },
  })
  const cancel = useMutation({
    mutationFn: () => cancelTransfer(publicId),
    onSuccess: async (result) => {
      setMessage(result.ok ? '전달 준비를 취소했어요. 추억은 키링에 그대로 남아 있습니다.' : '전달 준비를 취소하지 못했습니다.')
      await refresh()
      if (result.ok) navigate('/k/' + publicId, { replace: true })
    },
    onError: () => setMessage('전달 준비를 취소하지 못했습니다. 다시 시도해주세요.'),
  })

  const keyring = state.data
  if (state.isPending) return <AppShell title="추억 전달" backTo={'/k/' + publicId}><PageLoader /></AppShell>
  if (state.isError || !keyring?.exists) return <AppShell title="추억 전달" backTo={'/k/' + publicId}><ErrorNotice>키링을 확인할 수 없습니다.</ErrorNotice></AppShell>
  if (!keyring.is_owner) return <AppShell title="추억 전달" backTo={'/k/' + publicId}><ErrorNotice>키링 소유자만 전달을 준비할 수 있어요.</ErrorNotice></AppShell>
  if (keyring.status === 'transferred') return <AppShell title="추억 전달" backTo={'/k/' + publicId}><ErrorNotice>이미 전달된 키링은 다시 사용할 수 없습니다.</ErrorNotice></AppShell>
  if (keyring.status === 'unpaired') return <AppShell title="추억 전달" backTo={'/k/' + publicId}><ErrorNotice>먼저 키링을 활성화해주세요.</ErrorNotice></AppShell>

  return (
    <AppShell title="추억 전달 준비" backTo={'/k/' + publicId}>
      {keyring.status === 'active' && (
        <section className="app-card p-4">
          <p className="app-eyebrow">키링에 담긴 추억 전체</p>
          <h1 className="mt-2 text-xl font-bold text-ink">이 마음들을 한 번에 건넬까요?</h1>
          <p className="app-body-copy mt-2">전달 준비를 시작하면 추억 {keyring.memory_count ?? 0}개가 확정되고, 상대방이 키링을 태그해 받기를 확인할 때까지 새 기록은 잠깁니다.</p>
          {keyring.memory_count === 0 && <ErrorNotice>먼저 이 키링에 추억을 남겨주세요.</ErrorNotice>}
          {message && <p className="mt-3 text-sm text-ink-muted">{message}</p>}
          <button className="app-primary-button mt-4 w-full" disabled={!keyring.memory_count || prepare.isPending} onClick={() => { setMessage(''); prepare.mutate() }} type="button">
            {prepare.isPending ? '전달 준비 중…' : '전달할 준비하기'}
          </button>
        </section>
      )}
      {keyring.status === 'transfer_ready' && (
        <section className="app-card border-orange-200 bg-orange-50/85 p-4">
          <p className="app-eyebrow">전달 준비 완료 · 추억 {keyring.memory_count ?? 0}개</p>
          <h1 className="mt-2 text-xl font-bold text-ink">키링을 건네주세요</h1>
          <p className="app-body-copy mt-2">받는 사람이 같은 키링을 태그하고 ‘확인 · 추억 받기’를 누르면 모든 추억이 이전됩니다.</p>
          {keyring.transfer_expires_at && <p className="mt-4 text-center text-sm text-ink-muted">준비 만료: {new Date(keyring.transfer_expires_at).toLocaleString()}</p>}
          {message && <p className="mt-3 text-center text-sm text-ink-muted">{message}</p>}
          <button className="app-danger-button mt-4 w-full" disabled={cancel.isPending} onClick={() => cancel.mutate()} type="button">전달 준비 취소</button>
        </section>
      )}
      <Link className="mt-4 block py-2 text-center text-sm font-semibold text-orange-700" to={'/k/' + publicId + '/memories'}>이 키링의 추억 다시 보기</Link>
    </AppShell>
  )
}
