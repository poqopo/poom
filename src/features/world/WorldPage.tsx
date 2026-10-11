import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell, EmptyState, ErrorNotice, PageLoader } from '../../components/AppShell'
import { useAuth } from '../auth/useAuth'
import { fetchPhotoUrl, fetchWorld, type MemoryEntry, type WorldRegion } from '../memories/api'

const scenery: Record<WorldRegion['region_type'], Array<{ icon: string; x: number; y: number; label: string }>> = {
  cafe: [
    { icon: '☕', x: 8, y: 6, label: '작은 카페' },
    { icon: '🌳', x: 3, y: 8, label: '그늘 나무' },
    { icon: '🌼', x: 13, y: 3, label: '꽃밭' },
  ],
  park: [
    { icon: '🌳', x: 4, y: 4, label: '오래된 나무' },
    { icon: '⛲', x: 11, y: 7, label: '작은 연못' },
    { icon: '🌼', x: 2, y: 9, label: '풀꽃' },
  ],
  garden: [
    { icon: '🌷', x: 4, y: 4, label: '꽃밭' },
    { icon: '🌳', x: 12, y: 4, label: '정원 나무' },
    { icon: '🪴', x: 9, y: 9, label: '화분' },
  ],
  street: [
    { icon: '🏠', x: 4, y: 4, label: '집' },
    { icon: '🪧', x: 12, y: 6, label: '골목 표지판' },
    { icon: '🌳', x: 3, y: 9, label: '가로수' },
  ],
}

function MemoryImage({ memoryId }: { memoryId: string }) {
  const image = useQuery({
    queryKey: ['memory-photo', memoryId],
    queryFn: () => fetchPhotoUrl(memoryId),
    staleTime: 35_000,
    refetchInterval: 45_000,
  })
  if (image.isPending) return <div className="photo-placeholder memory-detail-image">사진을 불러오고 있어요</div>
  if (image.isError) return <p className="app-error">이 사진을 볼 권한이 없거나 주소가 만료됐어요.</p>
  return <img alt="전달받은 추억 사진" className="memory-detail-image" src={image.data} />
}

function regionLabel(kind: WorldRegion['region_type']) {
  return { cafe: '카페', park: '공원', garden: '정원', street: '거리' }[kind]
}

export function WorldPage() {
  const { user } = useAuth()
  const [selectedMemory, setSelectedMemory] = useState<MemoryEntry | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const world = useQuery({
    queryKey: user ? ['world', user.id] : ['world', 'none'],
    queryFn: () => fetchWorld(user!.id),
    enabled: Boolean(user),
  })
  const selectedRegionId = searchParams.get('region')
  const region = world.data?.regions.find((item) => item.id === selectedRegionId) ?? world.data?.regions[0]

  return (
    <AppShell title="추억의 세계" mapMode>
      {world.isPending && <PageLoader label="받은 추억의 세계를 만들고 있어요." />}
      {world.isError && <ErrorNotice>세계를 불러오지 못했습니다. 연결을 확인하고 다시 시도해주세요.</ErrorNotice>}
      {world.data && world.data.regions.length === 0 && (
        <EmptyState
          title="아직 맵이 없어요"
          body="키링을 받아 맵을 만들어보세요!"
          action={<Link className="app-secondary-action mt-4" to="/keyring">내 키링 보기</Link>}
        />
      )}
      {world.data && region && (
        <>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="app-eyebrow">{regionLabel(region.region_type)} · {world.data.regions.length}개 지역</p>
              <h2 className="truncate text-lg font-bold text-ink">{region.name}</h2>
            </div>
            <span className="shrink-0 rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">
              {region.map_data.objects.filter((item) => world.data?.memories.some((memory) => memory.id === item.memory_id)).length}개 추억 오브젝트
            </span>
          </div>

          {world.data.regions.length > 1 && (
            <div aria-label="지역 선택" className="mb-2 flex gap-2 overflow-x-auto py-1">
              {world.data.regions.map((item) => (
                <button
                  aria-pressed={item.id === region.id}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${item.id === region.id ? 'border-orange-200 bg-orange-100 font-semibold text-orange-700' : 'border-white bg-white/70 text-ink-muted'}`}
                  key={item.id}
                  onClick={() => setSearchParams({ region: item.id })}
                  type="button"
                >
                  {regionLabel(item.region_type)} · {item.name}
                </button>
              ))}
            </div>
          )}

          <div
            aria-label={`${region.name} 맵`}
            className="world-map"
            data-region={region.region_type}
            role="group"
          >
            {scenery[region.region_type].map((item) => (
              <span
                aria-label={item.label}
                className="world-map-landmark"
                key={item.label}
                style={{ left: `${((item.x + 0.5) / 16) * 100}%`, top: `${((item.y + 0.5) / 12) * 100}%` }}
              >{item.icon}</span>
            ))}
            {region.map_data.objects.map((object) => {
              const memory = world.data?.memories.find((item) => item.id === object.memory_id)
              if (!memory) return null
              return (
                <button
                  aria-label={`추억 열기: ${memory.text_content.slice(0, 24)}`}
                  className="world-memory-object"
                  key={object.memory_id}
                  onClick={() => setSelectedMemory(memory)}
                  style={{ left: `${((object.x + 0.5) / 16) * 100}%`, top: `${((object.y + 0.5) / 12) * 100}%` }}
                  type="button"
                >{object.kind === 'photo' ? '▧' : '✉'}</button>
              )
            })}
          </div>
          <p className="mt-2 text-center text-xs leading-5 text-ink-subtle">사진과 편지 오브젝트를 눌러 추억을 열어보세요.</p>
          <div className="mt-2 flex items-center justify-between rounded-2xl border border-white/80 bg-white/55 px-3 py-2 text-xs text-ink-muted">
            <span>전달받은 추억 {world.data.memories.length}개</span>
            <Link className="font-semibold text-orange-700" to="/memories">보관함 보기</Link>
          </div>
        </>
      )}
      {selectedMemory && (
        <div className="memory-sheet-backdrop" onClick={() => setSelectedMemory(null)} role="presentation">
          <section
            aria-labelledby="memory-sheet-title"
            aria-modal="true"
            className="memory-sheet"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold text-ink" id="memory-sheet-title">건네받은 추억</h2>
              <button aria-label="닫기" className="app-icon-button" onClick={() => setSelectedMemory(null)} type="button">×</button>
            </div>
            {selectedMemory.image_path && <MemoryImage memoryId={selectedMemory.id} />}
            <time className="mt-3 block text-xs text-ink-subtle" dateTime={selectedMemory.created_at}>
              {new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(selectedMemory.created_at))}
            </time>
            <p className="mt-2 whitespace-pre-wrap text-[15px] leading-7 text-ink">{selectedMemory.text_content}</p>
          </section>
        </div>
      )}
    </AppShell>
  )
}
