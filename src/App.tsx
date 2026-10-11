import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AppShell, ErrorNotice, PageLoader } from './components/AppShell'
import { useAuth } from './features/auth/useAuth'
import { LoginPage } from './features/auth/LoginPage'
import { HomePage } from './features/home/HomePage'
import { KeyringPage } from './features/keyring/KeyringPage'
import { AdminKeyringsPage } from './features/keyring/AdminKeyringsPage'
import { KeyringReceivePage } from './features/keyring/KeyringReceivePage'
import { KeyringTransferPage } from './features/keyring/KeyringTransferPage'
import { MemoryComposerPage } from './features/memories/MemoryComposerPage'
import { KeyringMemoriesPage, MemoryDetailPage, MemoryVaultPage } from './features/memories/MemoryVaultPage'
import { WorldPage } from './features/world/WorldPage'

function SessionGate() {
  const { isLoading, error, user } = useAuth()
  if (isLoading) return <PageLoader label="Poom을 시작하고 있어요." />
  if (error || !user) {
    return (
      <AppShell>
        <section className="app-card mt-8 p-5">
          <h1 className="text-lg font-bold text-ink">이 기기의 세션을 시작하지 못했어요</h1>
          <p className="app-body-copy mt-2">연결을 확인한 뒤 다시 시도해주세요. 브라우저 데이터를 지우면 익명 추억을 복구할 수 없을 수 있어요.</p>
          <ErrorNotice>{error ?? '익명 인증을 완료하지 못했습니다.'}</ErrorNotice>
          <button className="app-primary-button mt-3 w-full" onClick={() => window.location.reload()} type="button">다시 연결하기</button>
        </section>
      </AppShell>
    )
  }
  return (
    <Routes>
      <Route path="/" element={<Navigate replace to="/home" />} />
      <Route path="/home" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/onboarding" element={<Navigate replace to="/home" />} />
      <Route path="/memories" element={<MemoryVaultPage />} />
      <Route path="/memories/new" element={<Navigate replace to="/keyring" />} />
      <Route path="/memories/:memoryId" element={<MemoryDetailRoute />} />
      <Route path="/keyring" element={<KeyringPage />} />
      <Route path="/admin/keyrings" element={<AdminKeyringsPage />} />
      <Route path="/k/:publicId" element={<KeyringReceiveRoute />} />
      <Route path="/k/:publicId/new" element={<KeyringComposerRoute />} />
      <Route path="/k/:publicId/memories" element={<KeyringMemoriesRoute />} />
      <Route path="/k/:publicId/transfer" element={<KeyringTransferRoute />} />
      <Route path="/world" element={<WorldPage />} />
      <Route path="/auth/callback" element={<Navigate replace to="/home" />} />
      <Route path="*" element={<Navigate replace to="/home" />} />
    </Routes>
  )
}

function MemoryDetailRoute() {
  const { memoryId = '' } = useParams()
  return <MemoryDetailPage memoryId={memoryId} />
}

function KeyringReceiveRoute() {
  const { publicId = '' } = useParams()
  return <KeyringReceivePage key={publicId} publicId={publicId} />
}

function KeyringComposerRoute() {
  const { publicId = '' } = useParams()
  return <MemoryComposerPage key={publicId} publicId={publicId} />
}

function KeyringMemoriesRoute() {
  const { publicId = '' } = useParams()
  return <KeyringMemoriesPage key={publicId} publicId={publicId} />
}

function KeyringTransferRoute() {
  const { publicId = '' } = useParams()
  return <KeyringTransferPage key={publicId} publicId={publicId} />
}

export default function App() {
  return <SessionGate />
}
