import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AppShell, ErrorNotice, PageLoader } from '../../components/AppShell'
import { useAuth } from '../auth/useAuth'
import { fetchKeyringState, saveMemory } from './api'
import { preparePhoto } from './image'

const memoriesKey = (userId: string) => ['memories', userId] as const

export function MemoryComposerPage({ publicId }: { publicId: string }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState('')
  const [saveError, setSaveError] = useState('')
  const keyringQuery = useQuery({
    queryKey: ['keyring-state', publicId],
    queryFn: () => fetchKeyringState(publicId),
    enabled: Boolean(user),
  })

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user || !keyringQuery.data?.id || !keyringQuery.data.is_owner || keyringQuery.data.status !== 'active') {
        throw new Error('현재 키링은 새 추억을 기록할 수 있는 상태가 아닙니다.')
      }
      const compressedPhoto = photo ? await preparePhoto(photo) : null
      await saveMemory({
        id: crypto.randomUUID(),
        ownerId: user.id,
        keyringId: keyringQuery.data.id,
        text,
        photo: compressedPhoto,
      })
    },
    onSuccess: async () => {
      if (user) await queryClient.invalidateQueries({ queryKey: memoriesKey(user.id) })
      await queryClient.invalidateQueries({ queryKey: ['keyring-memories', keyringQuery.data?.id] })
      navigate('/k/' + publicId + '/memories')
    },
    onError: (error: unknown) => {
      setSaveError(error instanceof Error ? error.message : '저장하지 못했습니다. 입력한 글은 그대로 남아 있어요.')
    },
  })

  function handlePhoto(file: File | null) {
    setPhotoError('')
    if (!file) {
      setPhoto(null)
      setPreviewUrl(null)
      return
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPhotoError('JPG, PNG 또는 WebP 사진을 선택해주세요.')
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      setPhotoError('사진은 15MB 이하로 선택해주세요.')
      return
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPhoto(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  if (keyringQuery.isPending) return <AppShell title="추억 남기기" backTo={'/k/' + publicId}><PageLoader label="키링 상태를 확인하고 있어요." /></AppShell>
  if (!keyringQuery.data?.exists) return <AppShell title="추억 남기기" backTo="/keyring"><ErrorNotice>키링을 찾지 못했습니다.</ErrorNotice></AppShell>
  if (!keyringQuery.data.is_owner || keyringQuery.data.status !== 'active') {
    return <AppShell title="추억 남기기" backTo={'/k/' + publicId}><ErrorNotice>이 키링은 현재 기록을 추가할 수 있는 상태가 아닙니다.</ErrorNotice></AppShell>
  }

  return (
    <AppShell title="추억 남기기" backTo={'/k/' + publicId}>
      <section className="app-card p-4">
        <p className="app-eyebrow">마음이 머문 순간</p>
        <h2 className="mt-2 text-lg font-bold text-ink">그 사람이 떠오른 순간을 적어주세요</h2>
        <p className="app-body-copy mt-1">함께 있지 않아도 괜찮아요. 문득 생각난 순간을 조용히 담아둘게요.</p>

        <label className="mt-5 block text-sm font-semibold text-ink" htmlFor="memory-text">짧은 글 <span className="text-orange-700">필수</span></label>
        <textarea
          id="memory-text"
          className="app-textarea mt-2"
          maxLength={500}
          onChange={(event) => setText(event.target.value)}
          placeholder="오늘 지나가다가 네가 좋아할 만한 꽃을 발견했어."
          value={text}
        />
        <div className="mt-1 text-right text-xs text-ink-subtle">{text.length}/500</div>

        <div className="mt-4">
          <label className="block text-sm font-semibold text-ink" htmlFor="memory-photo">사진 <span className="font-normal text-ink-muted">선택 · 최대 1장</span></label>
          {previewUrl ? (
            <div className="mt-2">
              <img alt="추억 사진 미리보기" className="memory-photo-preview" src={previewUrl} />
              <button className="app-secondary-action mt-2 w-full" onClick={() => handlePhoto(null)} type="button">사진 제거</button>
            </div>
          ) : (
            <label className="mt-2 flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-orange-200 bg-orange-50/70 p-4 text-center text-sm text-ink-muted" htmlFor="memory-photo">
              <span className="text-xl text-orange-700">＋</span>
              <span className="mt-1 font-semibold">사진 한 장 추가하기</span>
              <span className="mt-1 text-xs">JPG · PNG · WebP, 15MB 이하</span>
            </label>
          )}
          <input
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            id="memory-photo"
            onChange={(event) => {
              handlePhoto(event.target.files?.[0] ?? null)
              event.currentTarget.value = ''
            }}
            type="file"
          />
          {photoError && <ErrorNotice>{photoError}</ErrorNotice>}
        </div>

        {saveError && <ErrorNotice>{saveError}<br />입력한 글은 화면에 남아 있습니다. 연결을 확인하고 다시 저장해주세요.</ErrorNotice>}
        {keyringQuery.isError && <ErrorNotice>키링 정보를 가져오지 못했습니다. 새로고침 후 다시 시도해주세요.</ErrorNotice>}
        <p className="mt-4 text-xs leading-5 text-ink-subtle">사진은 비공개로 저장되고, 전달을 마친 뒤에는 받는 사람만 볼 수 있어요.</p>
      </section>
      <p className="mb-2 mt-3 text-center text-xs text-ink-subtle">기록 날짜는 저장한 시각으로 자동 저장됩니다.</p>
      <div className="composer-sticky-action">
        <button
          className="app-primary-button w-full"
          disabled={!text.trim() || !keyringQuery.data.id || saveMutation.isPending}
          onClick={() => {
            setSaveError('')
            saveMutation.mutate()
          }}
          type="button"
        >{saveMutation.isPending ? '추억을 담고 있어요…' : '추억 상자에 담기'}</button>
      </div>
      <Link className="mb-1 block py-3 text-center text-sm font-semibold text-orange-700" to={'/k/' + publicId + '/memories'}>이 키링의 추억 보기</Link>
    </AppShell>
  )
}
