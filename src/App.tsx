import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './features/auth/useAuth'
import { LoginPage } from './features/auth/LoginPage'
import { HomePage } from './features/home/HomePage'

function SessionLoading() {
  return (
    <main className="grid min-h-[100dvh] place-items-center px-6 text-ink-muted">
      <div className="text-center" role="status">
        <span className="mx-auto block size-8 animate-spin rounded-full border-2 border-orange-200 border-t-orange-700" />
        <p className="mt-4 text-sm">로그인 상태를 확인하고 있어요.</p>
      </div>
    </main>
  )
}

function LoginRoute() {
  const { isLoading, user } = useAuth()
  if (isLoading) return <SessionLoading />
  return user ? <Navigate replace to="/" /> : <LoginPage />
}

function HomeRoute() {
  const { isLoading, user } = useAuth()
  if (isLoading) return <SessionLoading />
  return user ? <HomePage /> : <Navigate replace to="/login" />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/" element={<HomeRoute />} />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  )
}
