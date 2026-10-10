import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Brand } from '../../components/Brand'
import { useAuth } from '../auth/useAuth'
import { useHomeSummary } from './useHomeSummary'

function WorldIllustration() {
  return (
    <svg aria-hidden="true" className="world-art" fill="none" viewBox="0 0 520 300">
      <ellipse cx="265" cy="251" fill="#D9AF84" opacity=".45" rx="205" ry="29" />
      <path d="M70 218c18-57 89-87 185-75 85-41 181-12 194 54 18 88-70 99-197 95-110-3-209-13-182-74Z" fill="#A6B58D" />
      <path d="M86 213c35-34 101-47 166-28 36-24 124-30 168-2 47 30 10 78-81 83-75 5-173-1-221-14-31-8-46-22-32-39Z" fill="#C5C99F" />
      <path d="M169 226c22-16 58-16 80-3 17 10 20 28 1 34-18 7-50 4-72-4-19-7-25-18-9-27Z" fill="#E8D0AE" />
      <path d="M211 244c24 8 44 8 67 3 25-5 42-14 61-11 20 3 22 20 2 28-29 12-91 10-131 1-19-5-19-16 1-21Z" fill="#E8D0AE" />
      <path d="m230 132 38-32 38 32v55h-76v-55Z" fill="#FFF5E8" />
      <path d="m220 136 48-41 48 41-8 8-40-34-40 34-8-8Z" fill="#B85C35" />
      <path d="M244 148h18v20h-18zM273 148h18v20h-18z" fill="#EBAA70" />
      <path d="M257 163h22v24h-22z" fill="#A66A4D" />
      <path d="M310 185v-29l21-17 21 17v29h-42Z" fill="#F3C899" />
      <path d="m304 159 27-23 27 23-6 7-21-18-21 18-6-7Z" fill="#9E674C" />
      <circle cx="331" cy="165" r="4" fill="#8C5F45" />
      <path d="M130 188c0-20 12-36 28-36s28 16 28 36v19h-56v-19Z" fill="#789576" />
      <path d="M158 140c-16 0-29 13-29 29 16 0 29-13 29-29ZM160 154c0-15 12-27 27-27 0 15-12 27-27 27Z" fill="#789576" />
      <path d="M396 190c0-15 9-27 21-27s21 12 21 27v14h-42v-14Z" fill="#879B73" />
      <path d="M416 153c-12 0-22 10-22 22 12 0 22-10 22-22ZM418 162c0-11 9-20 20-20 0 11-9 20-20 20Z" fill="#879B73" />
      <path d="M97 182c0-12 8-21 18-21s18 9 18 21v13H97v-13Z" fill="#9EAD81" />
      <path d="M115 151c-10 0-19 9-19 19 10 0 19-9 19-19ZM117 158c0-10 8-18 18-18 0 10-8 18-18 18Z" fill="#9EAD81" />
      <path d="M360 94c8-13 25-9 25 5 0 13-25 28-25 28s-25-15-25-28c0-14 17-18 25-5Z" fill="#FFF9F3" opacity=".82" />
      <path d="M408 112h21m-10-10v21" stroke="#E9783C" strokeLinecap="round" strokeWidth="3" />
      <path d="M122 104h17m-8-8v17" stroke="#FFFDF9" strokeLinecap="round" strokeWidth="3" />
    </svg>
  )
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' }).format(new Date(date))
}

export function HomePage({ displayName }: { displayName: string }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const summary = useHomeSummary(user?.id ?? '')
  const [signOutError, setSignOutError] = useState('')
  const homeDisplayName = summary.data?.display_name || displayName

  async function handleSignOut() {
    setSignOutError('')
    try {
      await signOut()
      navigate('/login', { replace: true })
    } catch {
      setSignOutError('로그아웃하지 못했습니다. 잠시 후 다시 시도해주세요.')
    }
  }

  return (
    <main className="home-scene min-h-[100dvh] px-4">
      <div className="home-shell mx-auto">
        <header className="home-header flex items-center justify-between gap-3">
          <Brand compact />
          <div className="flex items-center gap-3">
            <span className="user-greeting truncate text-sm text-ink-muted">반가워요, <strong className="font-semibold text-ink">{homeDisplayName}</strong></span>
            <button className="min-h-11 rounded-full border border-line bg-white/70 px-4 text-sm font-semibold text-ink-muted transition hover:bg-white focus-visible:outline-2 focus-visible:outline-orange-700" onClick={handleSignOut} type="button">로그아웃</button>
          </div>
        </header>

        {signOutError && <p className="mt-4 text-right text-sm text-danger" role="alert">{signOutError}</p>}

        <section className="home-content grid">
          <article className="world-card world-preview relative flex flex-col overflow-hidden rounded-[30px] border border-white/80 shadow-glass">
            <div className="world-copy relative z-10">
              <span className="inline-flex rounded-full border border-white/80 bg-white/65 px-3 py-1.5 text-xs font-semibold tracking-wide text-orange-700">받은 추억으로 열릴 공간</span>
              <h1 className="mt-2 text-2xl leading-tight font-bold tracking-tight text-ink">곧 만나게 될 추억의 세계</h1>
              <p className="mt-1.5 text-sm leading-5 text-ink-muted">
                둘만의 순간이 모이면 이곳에 작은 세계가 열려요.
              </p>
            </div>
            <div className="world-landscape" aria-hidden="true">
              <WorldIllustration />
            </div>
            <div className="world-actions relative z-10 flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 rounded-full border border-white/75 bg-white/65 px-3 py-2 text-xs font-medium text-ink-muted">
                <span aria-hidden="true" className="size-2 rounded-full bg-orange-400" />
                아직 열리지 않은 세계
              </span>
              <button className="min-h-11 rounded-full border border-orange-200 bg-white/75 px-3 text-xs font-semibold text-orange-700" disabled type="button">세계 들어가기 · 준비 중</button>
            </div>
          </article>

          <article className="memory-summary glass-card glass-card--peach flex flex-col rounded-[28px] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-orange-700">조금씩 모아두는 마음</p>
                <h2 className="mt-2 text-xl font-bold text-ink">아직 전하지 않은 추억</h2>
              </div>
              <span aria-label="추억" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/75 text-lg text-orange-700">✉</span>
            </div>

            {summary.isPending && (
              <div className="my-8 flex items-center gap-3 text-sm text-ink-muted" role="status">
                <span className="size-5 animate-spin rounded-full border-2 border-orange-200 border-t-orange-700" />
                추억 상자를 열고 있어요.
              </div>
            )}

            {summary.isError && (
              <div className="my-6 rounded-2xl border border-red-200/80 bg-red-50/70 p-4" role="alert">
                <p className="text-sm leading-6 text-danger">홈 정보를 불러오지 못했어요. 로그인 상태를 확인한 뒤 다시 시도해주세요.</p>
                <button className="mt-3 min-h-10 rounded-full border border-red-200 bg-white/70 px-4 text-sm font-semibold text-danger" onClick={() => void summary.refetch()} type="button">다시 불러오기</button>
              </div>
            )}

            {summary.isSuccess && (
              <>
                <div className="mt-6 flex items-end gap-2">
                  <span className="text-5xl leading-none font-bold tracking-tight text-ink">{summary.data.pending_memory_count}</span>
                  <span className="pb-1 text-sm text-ink-muted">개의 마음이 기다리고 있어요</span>
                </div>
                <div className="mt-5 border-t border-orange-200/70 pt-4">
                  {summary.data.recent_memories.length === 0 ? (
                    <p className="rounded-2xl bg-white/55 px-4 py-5 text-sm leading-6 text-ink-muted">아직 쌓인 추억이 없어요.<br />일상 속에서 그 사람이 떠오른 순간을 담아보세요.</p>
                  ) : (
                    <ul className="space-y-2">
                      {summary.data.recent_memories.slice(0, 1).map((memory) => (
                        <li className="rounded-2xl border border-white/75 bg-white/65 p-4" key={memory.id}>
                          <p className="line-clamp-2 text-sm leading-6 text-ink">{memory.text_content}</p>
                          <time className="mt-2 block text-xs text-ink-subtle" dateTime={memory.created_at}>{formatDate(memory.created_at)}</time>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}

            <button className="memory-cta mt-auto min-h-[50px] w-full rounded-control bg-orange-600 px-5 text-[15px] font-semibold text-white opacity-75" disabled title="추억 남기기는 준비 중입니다." type="button">
              추억 남기기 · 준비 중
            </button>
          </article>
        </section>
      </div>
    </main>
  )
}
