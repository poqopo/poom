import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Brand } from '../../components/Brand'
import { useAuth } from '../auth/useAuth'
import { fetchWorld, type WorldRegion } from '../memories/api'

const regionLabels: Record<WorldRegion['region_type'], string> = {
  cafe: '카페',
  park: '공원',
  garden: '정원',
  street: '거리',
}

function WorldMapTile({ region, memories }: {
  region: WorldRegion
  memories: Array<{ id: string }>
}) {
  const memoryIds = new Set(memories.map((memory) => memory.id))
  const objects = region.map_data.objects.filter((object) => memoryIds.has(object.memory_id))

  return (
    <Link
      aria-label={`${region.name} 세계 탐험하기`}
      className="home-map-tile"
      data-region={region.region_type}
      to={{ pathname: '/world', search: `?region=${encodeURIComponent(region.id)}` }}
    >
      <div aria-hidden="true" className="home-map-landscape">
        <span className="home-map-cloud home-map-cloud--one">☁</span>
        <span className="home-map-cloud home-map-cloud--two">☁</span>
        <span className="home-map-landmark home-map-landmark--one">{region.region_type === 'cafe' ? '☕' : region.region_type === 'street' ? '🏠' : '🌳'}</span>
        <span className="home-map-landmark home-map-landmark--two">{region.region_type === 'garden' ? '🌷' : region.region_type === 'park' ? '⛲' : '🌼'}</span>
        {objects.map((object) => (
          <span
            className="home-map-memory"
            key={object.memory_id}
            style={{ left: `${((object.x + 0.5) / 16) * 100}%`, top: `${((object.y + 0.5) / 12) * 100}%` }}
          >{object.kind === 'photo' ? '▧' : '✉'}</span>
        ))}
      </div>
      <span className="home-map-caption">
        <span>
          <span className="home-map-category">{regionLabels[region.region_type]}</span>
          <strong>{region.name}</strong>
        </span>
        <span aria-hidden="true" className="home-map-arrow">↗</span>
      </span>
    </Link>
  )
}

function EmptyWorldBanner() {
  return (
    <div aria-label="추억의 세계 미리보기" className="home-empty-world">
      <img alt="" aria-hidden="true" className="empty-world-map-image" src="/map.jpeg" />
      <div className="home-empty-copy">
        <div className="home-empty-copy-panel">
          <h1>아직 맵이 없어요</h1>
          <p>키링을 받아 맵을 만들어보세요!</p>
        </div>
      </div>
    </div>
  )
}

export function HomePage() {
  const { user } = useAuth()
  const [showNfcPrompt, setShowNfcPrompt] = useState(false)
  const world = useQuery({
    queryKey: user ? ['world', user.id] : ['world', 'none'],
    queryFn: () => fetchWorld(user!.id),
    enabled: Boolean(user),
  })

  return (
    <main className="home-launcher">
      <header aria-label="Poom" className="home-brand-header">
        <Link aria-label="Poom 홈" className="home-brand-link" to="/home"><Brand compact /></Link>
      </header>

      <div className="home-main-content">
        <section aria-label="전달받은 추억의 맵" className="home-map-banner">
          {world.isPending && <div className="home-map-message" role="status">추억의 세계를 불러오고 있어요…</div>}
          {world.isError && <div className="home-map-message" role="alert">세계를 불러오지 못했어요. 잠시 후 다시 시도해주세요.</div>}
          {world.data?.regions.length === 0 && <EmptyWorldBanner />}
          {world.data && world.data.regions.length > 0 && (
            <div aria-label="받은 맵 목록, 가로로 밀어보세요" className="home-map-carousel">
              {world.data.regions.map((region) => (
                <WorldMapTile key={region.id} memories={world.data!.memories} region={region} />
              ))}
            </div>
          )}
        </section>

        <nav aria-label="홈 주요 기능" className="home-actions">
          <button className="home-action home-action--primary" onClick={() => setShowNfcPrompt(true)} type="button">
            <span aria-hidden="true" className="home-action-icon">✎</span>
            <span>추억 기록하기</span>
            <span aria-hidden="true" className="home-action-arrow">›</span>
          </button>
          <Link className="home-action home-action--secondary" to="/world">
            <span aria-hidden="true" className="home-action-icon">✦</span>
            <span>추억 열어보기</span>
            <span aria-hidden="true" className="home-action-arrow">›</span>
          </Link>
        </nav>
      </div>

      {showNfcPrompt && (
        <div className="memory-sheet-backdrop" onClick={() => setShowNfcPrompt(false)} role="presentation">
          <section
            aria-labelledby="nfc-prompt-title"
            aria-modal="true"
            className="memory-sheet nfc-prompt-sheet"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="mb-3 flex items-center justify-between">
              <span aria-hidden="true" className="nfc-prompt-icon">◉</span>
              <button aria-label="닫기" className="app-icon-button" onClick={() => setShowNfcPrompt(false)} type="button">×</button>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-ink" id="nfc-prompt-title">NFC를 대주세요</h2>
            <p className="mt-2 text-sm leading-6 text-ink-muted">NFC 키링을 휴대폰 뒷면에 가까이 대면 해당 키링 화면이 열려요. 키링이 열리지 않으면 목록에서 직접 선택할 수 있어요.</p>
            <Link className="app-primary-button mt-5 w-full" onClick={() => setShowNfcPrompt(false)} to="/keyring">키링 목록에서 선택</Link>
          </section>
        </div>
      )}
    </main>
  )
}
