import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AppShell, EmptyState, ErrorNotice, PageLoader } from '../../components/AppShell'
import { useAuth } from '../auth/useAuth'
import {
  deleteMemory,
  fetchKeyringMemories,
  fetchKeyringState,
  fetchMyKeyrings,
  fetchMyMemories,
  fetchPhotoUrl,
  type KeyringStatus,
  type MemoryEntry,
} from './api'

const memoriesKey = (userId: string) => ['memories', userId] as const

function PrivatePhoto({ memoryId, className = '' }: { memoryId: string; className?: string }) {
  const photo = useQuery({
    queryKey: ['memory-photo', memoryId],
    queryFn: () => fetchPhotoUrl(memoryId),
    staleTime: 35_000,
    refetchInterval: 45_000,
  })
  if (photo.isPending) return <div aria-label="사진을 불러오는 중" className={'photo-placeholder ' + className}>사진</div>
  if (photo.isError) return <div aria-label="사진을 불러오지 못함" className={'photo-placeholder ' + className}>사진 없음</div>
  return <img alt="비공개 추억 사진" className={className} src={photo.data} />
}

function statusText(status: KeyringStatus) {
  return { unpaired: '활성화 대기', active: '기록 가능', pending_transfer: '전달 대기', transfer_ready: '전달 대기', transferred: '전달 완료' }[status]
}

export function MemoryVaultPage() {
  const { user } = useAuth()
  const keyrings = useQuery({
    queryKey: user ? ['keyrings', user.id] : ['keyrings', 'none'],
    queryFn: fetchMyKeyrings,
    enabled: Boolean(user),
  })
  const memories = useQuery({
    queryKey: user ? memoriesKey(user.id) : ['memories', 'none'],
    queryFn: () => fetchMyMemories(user!.id),
    enabled: Boolean(user),
  })
  const legacyMemories = memories.data?.filter((memory) => memory.keyring_id === null) ?? []

  return (
    <AppShell title="추억 보관함" backTo="/home">
      <div className="mb-3 flex items-center justify-between px-1">
        <div>
          <p className="app-eyebrow">키링별 추억상자</p>
          <p className="mt-1 text-sm text-ink-muted">각 키링의 추억은 서로 분리되어 있어요.</p>
        </div>
        <Link className="app-secondary-action min-h-10 px-3 text-sm" to="/keyring">키링 보기</Link>
      </div>
      {(keyrings.isPending || memories.isPending) && <PageLoader />}
      {(keyrings.isError || memories.isError) && <ErrorNotice>보관함을 불러오지 못했습니다.</ErrorNotice>}
      {keyrings.data?.length === 0 && legacyMemories.length === 0 && !keyrings.isPending && (
        <EmptyState title="아직 등록한 키링이 없어요" body="관리자가 발급한 실물 키링을 처음 태그해 활성화하면 추억을 담을 수 있어요." action={<Link className="app-primary-button mt-4" to="/keyring">내 키링 확인</Link>} />
      )}
      <div className="space-y-3">
        {keyrings.data?.map((keyring) => {
          const count = memories.data?.filter((memory) => memory.keyring_id === keyring.id).length ?? 0
          return (
            <Link className="app-card flex items-center gap-3 p-4 text-inherit no-underline" key={keyring.id} to={'/k/' + keyring.public_id + '/memories'}>
              <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-orange-100 text-xl text-orange-700">◉</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-ink">{keyring.name}</span>
                <span className="mt-1 block text-xs text-ink-muted">{statusText(keyring.status)} · 추억 {count}개</span>
              </span>
              <span aria-hidden="true" className="text-lg text-orange-700">›</span>
            </Link>
          )
        })}
      </div>
      {legacyMemories.length > 0 && (
        <section className="mt-4">
          <p className="app-eyebrow mb-2">키링에 연결되지 않은 이전 기록</p>
          <div className="space-y-2">
            {legacyMemories.map((memory) => (
              <Link className="app-card block p-3 text-inherit no-underline" key={memory.id} to={'/memories/' + memory.id}>
                <p className="line-clamp-2 text-sm leading-6 text-ink">{memory.text_content}</p>
                <time className="mt-2 block text-xs text-ink-subtle" dateTime={memory.created_at}>
                  {new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(new Date(memory.created_at))}
                </time>
              </Link>
            ))}
          </div>
          <p className="mt-2 text-xs leading-5 text-ink-subtle">이 기록은 기존 데이터 그대로 보존되며 임의로 새 키링에 옮기지 않았어요.</p>
        </section>
      )}
    </AppShell>
  )
}

export function KeyringMemoriesPage({ publicId }: { publicId: string }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const state = useQuery({
    queryKey: ['keyring-state', publicId],
    queryFn: () => fetchKeyringState(publicId),
  })
  const keyringId = state.data?.id
  const memories = useQuery({
    queryKey: user && keyringId ? ['keyring-memories', keyringId] : ['keyring-memories', 'none'],
    queryFn: () => fetchKeyringMemories(keyringId!),
    enabled: Boolean(user && keyringId && state.data?.is_owner),
  })
  const remove = useMutation({
    mutationFn: (memory: MemoryEntry) => deleteMemory(memory),
    onSuccess: async () => {
      if (user && keyringId) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['keyring-memories', keyringId] }),
          queryClient.invalidateQueries({ queryKey: memoriesKey(user.id) }),
          queryClient.invalidateQueries({ queryKey: ['keyring-state', publicId] }),
        ])
      }
    },
  })
  const canEdit = state.data?.status === 'active' && state.data.is_owner

  if (state.isPending) return <AppShell title="이 키링의 추억" backTo={'/k/' + publicId}><PageLoader /></AppShell>
  if (state.isError || !state.data?.exists) return <AppShell title="이 키링의 추억" backTo={'/k/' + publicId}><ErrorNotice>키링을 확인할 수 없습니다.</ErrorNotice></AppShell>
  if (!state.data.is_owner) {
    return <AppShell title="이 키링의 추억" backTo={'/k/' + publicId}><EmptyState title="이 추억상자를 볼 수 없어요" body="현재 키링 소유자만 추억을 열람할 수 있습니다." /></AppShell>
  }

  return (
    <AppShell title={state.data.name ?? '이 키링의 추억'} backTo={'/k/' + publicId}>
      <div className="mb-3 flex items-center justify-between px-1">
        <div>
          <p className="app-eyebrow">{statusText(state.data.status ?? 'active')}</p>
          <p className="mt-1 text-sm text-ink-muted">이 키링에 담긴 모든 순간</p>
        </div>
        {canEdit && <Link className="app-secondary-action min-h-10 px-3 text-sm" to={'/k/' + publicId + '/new'}>＋ 기록</Link>}
      </div>
      {['pending_transfer', 'transfer_ready'].includes(state.data.status ?? '') && <aside className="mb-3 rounded-2xl bg-orange-50 p-3 text-xs leading-5 text-ink-muted">전달이 진행 중이라 새 기록과 삭제가 잠시 멈춰 있어요.</aside>}
      {memories.isPending && <PageLoader />}
      {memories.isError && <ErrorNotice>이 키링의 추억을 불러오지 못했습니다.</ErrorNotice>}
      {remove.isError && <ErrorNotice>추억을 삭제하지 못했습니다. 다시 시도해주세요.</ErrorNotice>}
      {memories.data?.length === 0 && (
        <EmptyState
          title="아직 이 키링에 추억이 없어요"
          body="소중한 사람이 생각난 순간을 사진과 글로 담아보세요."
          action={canEdit ? <Link className="app-primary-button mt-4" to={'/k/' + publicId + '/new'}>첫 추억 남기기</Link> : undefined}
        />
      )}
      <div className="space-y-3">
        {memories.data?.map((memory) => (
          <article className="app-card flex gap-3 p-3" key={memory.id}>
            <Link className="min-w-0 flex-1 text-inherit no-underline" to={'/memories/' + memory.id}>
              <div className="flex gap-3">
                {memory.image_path && <PrivatePhoto className="memory-thumbnail" memoryId={memory.id} />}
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-3 text-sm leading-6 text-ink">{memory.text_content}</p>
                  <time className="mt-2 block text-xs text-ink-subtle" dateTime={memory.created_at}>
                    {new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(memory.created_at))}
                  </time>
                </div>
              </div>
            </Link>
            {canEdit && memory.status === 'draft' && (
              <button
                aria-label="추억 삭제"
                className="memory-delete"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm('이 키링에서 이 추억을 삭제할까요?')) remove.mutate(memory)
                }}
                type="button"
              >×</button>
            )}
          </article>
        ))}
      </div>
      {state.data.status === 'active' && canEdit && memories.data && memories.data.length > 0 && (
        <Link className="app-primary-button mt-4 w-full" to={'/k/' + publicId + '/transfer'}>키링에 담긴 추억 한 번에 전달하기</Link>
      )}
      {state.data.status === 'transferred' && (
        <p className="mt-4 text-center text-xs leading-5 text-ink-subtle">전달된 추억은 수령한 사람만 열람할 수 있어요.</p>
      )}
    </AppShell>
  )
}

export function MemoryDetailPage({ memoryId }: { memoryId: string }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const keyrings = useQuery({
    queryKey: user ? ['keyrings', user.id] : ['keyrings', 'none'],
    queryFn: fetchMyKeyrings,
    enabled: Boolean(user),
  })
  const memoriesQuery = useQuery({
    queryKey: user ? memoriesKey(user.id) : ['memories', 'none'],
    queryFn: () => fetchMyMemories(user!.id),
    enabled: Boolean(user),
  })
  const memory = memoriesQuery.data?.find((entry) => entry.id === memoryId)
  const remove = useMutation({
    mutationFn: () => memory ? deleteMemory(memory) : Promise.resolve(),
    onSuccess: async () => {
      if (user) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: memoriesKey(user.id) }),
          queryClient.invalidateQueries({ queryKey: ['keyring-memories', memory?.keyring_id] }),
        ])
      }
    },
  })
  const keyring = memory?.keyring_id
    ? keyrings.data?.find((entry) => entry.id === memory.keyring_id)
    : null
  const backTo = keyring ? '/k/' + keyring.public_id + '/memories' : '/memories'

  return (
    <AppShell title="추억 한 장" backTo={backTo}>
      {memoriesQuery.isPending && <PageLoader />}
      {memoriesQuery.isError && <ErrorNotice>추억을 불러오지 못했습니다.</ErrorNotice>}
      {!memoriesQuery.isPending && !memory && <EmptyState title="추억을 찾지 못했어요" body="소유권이 바뀌었거나 삭제된 기록일 수 있어요." />}
      {memory && (
        <article className="app-card p-4">
          {memory.image_path && <PrivatePhoto className="memory-detail-image" memoryId={memory.id} />}
          <time className="mt-4 block text-xs text-ink-subtle" dateTime={memory.created_at}>
            {new Intl.DateTimeFormat('ko-KR', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(memory.created_at))}
          </time>
          <p className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-ink">{memory.text_content}</p>
          {memory.status === 'draft' && (
            <button
              className="app-danger-button mt-5 w-full"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm('이 추억을 삭제할까요?')) remove.mutate()
              }}
              type="button"
            >{remove.isPending ? '삭제하고 있어요…' : '이 추억 삭제하기'}</button>
          )}
          {remove.isError && <ErrorNotice>삭제하지 못했습니다. 다시 시도해주세요.</ErrorNotice>}
        </article>
      )}
    </AppShell>
  )
}
