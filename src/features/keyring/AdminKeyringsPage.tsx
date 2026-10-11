import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AppShell, ErrorNotice } from '../../components/AppShell'
import { createKeyringLink } from '../memories/api'

export function AdminKeyringsPage() {
  const [name, setName] = useState('')
  const [issued, setIssued] = useState<{ id: string; publicId: string } | null>(null)
  const issue = useMutation({
    mutationFn: () => createKeyringLink(name.trim() || undefined),
    onSuccess: (keyring) => {
      setIssued({ id: keyring.id, publicId: keyring.public_id })
      setName('')
    },
  })

  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value) } catch { /* Keep the value visible for manual copying. */ }
  }

  return (
    <AppShell title="키링 링크 만들기">
          <section className="app-hero">
            <p className="app-eyebrow">NFC 키링 준비</p>
            <h2>키링마다 고유한 링크를<br />만들어 태그에 기록하세요.</h2>
            <p className="app-body-copy mt-2">링크를 만들면 키링 UUID와 NFC URL이 발급돼요. URL을 태그에 기록한 뒤, 키링을 받은 사람이 처음 태그하면 소유자로 연결됩니다.</p>
          </section>
          <section className="app-card mt-3 p-4">
            <label className="block text-sm font-semibold text-ink" htmlFor="issued-keyring-name">키링 이름 <span className="font-normal text-ink-subtle">선택</span></label>
            <input className="app-input mt-2" id="issued-keyring-name" maxLength={40} onChange={(event) => setName(event.target.value)} placeholder="예: Poom 키링" value={name} />
            <button className="app-primary-button mt-3 w-full" disabled={issue.isPending} onClick={() => issue.mutate()} type="button">
              {issue.isPending ? '키링 링크를 만들고 있어요…' : '키링 링크 생성하기'}
            </button>
            {issue.isError && <ErrorNotice>키링 링크를 만들지 못했습니다. 연결 상태를 확인하고 다시 시도해주세요.</ErrorNotice>}
          </section>
          {issued && (
            <section aria-live="polite" className="app-card mt-3 border-orange-200 bg-orange-50/85 p-4">
              <p className="app-eyebrow">키링 링크 생성 완료</p>
              <h2 className="mt-1 font-bold text-ink">키링 UUID</h2>
              <code className="mt-2 block break-all rounded-xl bg-white px-3 py-3 text-xs text-ink">{issued.id}</code>
              <p className="app-body-copy mt-3">아래 링크를 NFC 태그에 기록하세요.</p>
              <code className="mt-3 block break-all rounded-xl bg-white px-3 py-3 text-sm text-ink">{window.location.origin + '/k/' + issued.publicId}</code>
              <button className="app-secondary-action mt-3 w-full" onClick={() => void copy(window.location.origin + '/k/' + issued.publicId)} type="button">URL 복사</button>
            </section>
          )}
    </AppShell>
  )
}
