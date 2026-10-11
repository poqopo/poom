import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell, EmptyState, ErrorNotice, PageLoader } from '../../components/AppShell'
import { useAuth } from '../auth/useAuth'
import {
  fetchMyKeyringsWithCounts,
  type KeyringStatus,
} from '../memories/api'

const keyringsKey = (userId: string) => ['keyrings', userId] as const

function statusLabel(status: KeyringStatus) {
  return {
    unpaired: '활성화 대기',
    active: '사용 중',
    pending_transfer: '전달 준비',
    transfer_ready: '전달 준비',
    transferred: '전달 완료',
  }[status]
}

export function KeyringPage() {
  const { user } = useAuth()
  const keyrings = useQuery({
    queryKey: user ? keyringsKey(user.id) : ['keyrings', 'none'],
    queryFn: () => fetchMyKeyringsWithCounts(user!.id),
    enabled: Boolean(user),
  })

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // The URL and code stay visible for manual copying if clipboard access is unavailable.
    }
  }

  return (
    <AppShell homeBrandOnly>
      {keyrings.isPending && <PageLoader label="내 키링을 불러오고 있어요." />}
      {keyrings.isError && <ErrorNotice>키링 목록을 불러오지 못했습니다.</ErrorNotice>}
      {keyrings.data?.length === 0 && (
        <EmptyState title="아직 등록한 키링이 없어요" body="관리자가 발급한 실물 키링을 처음 태그하고 활성화하면 이 목록에 표시돼요." />
      )}

      <div className="mt-4 space-y-3">
        {keyrings.data?.map((keyring) => {
          const url = window.location.origin + '/k/' + keyring.public_id
          return (
            <article className="app-card keyring-list-card p-4" key={keyring.id}>
              <Link aria-label={`${keyring.name} 키링 상세 보기`} className="keyring-overview-link" to={'/k/' + keyring.public_id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="app-eyebrow">{statusLabel(keyring.status)}</p>
                    <h2 className="mt-1 truncate font-bold text-ink">{keyring.name}</h2>
                  </div>
                  <span aria-label={statusLabel(keyring.status)} className={'keyring-status keyring-status--' + keyring.status}>{keyring.status === 'transferred' ? '✓' : '◉'}</span>
                </div>
                <dl className="keyring-facts mt-3">
                  <div>
                    <dt>키링 ID</dt>
                    <dd><code>{keyring.id}</code></dd>
                  </div>
                  <div className="keyring-memory-count">
                    <dt>모인 추억</dt>
                    <dd>{keyring.memory_count}<span>개</span></dd>
                  </div>
                </dl>
                <span aria-hidden="true" className="keyring-detail-hint">키링 자세히 보기 <span>›</span></span>
              </Link>
              <div className="mt-3 flex items-center gap-2">
                <code className="keyring-url min-w-0 flex-1 truncate rounded-xl bg-orange-50 px-3 py-2 text-xs text-ink">{url}</code>
                <button aria-label={`${keyring.name} URL 복사`} className="app-secondary-action keyring-copy-button" onClick={() => void copy(url)} type="button">복사</button>
              </div>
            </article>
          )
        })}
      </div>
      <p className="mb-2 mt-4 text-center text-xs leading-5 text-ink-subtle">NFC 태그에는 URL만 저장합니다. 사진과 글은 키링 UUID별 비공개 Storage 경로에 보관됩니다.</p>
    </AppShell>
  )
}
