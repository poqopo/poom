import type { PropsWithChildren, ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Brand } from './Brand'

type AppShellProps = PropsWithChildren<{
  title?: string
  backTo?: string
  actions?: ReactNode
  mapMode?: boolean
  homeBrandOnly?: boolean
}>

export function AppShell({ children, title, backTo, actions, mapMode = false, homeBrandOnly = false }: AppShellProps) {
  const navigate = useNavigate()
  return (
    <div className="app-layout">
      <div className="app-shell">
        <header className="app-topbar app-topbar--center-brand">
          <div className="app-topbar-leading">
            {backTo ? (
            <button
              aria-label="뒤로 가기"
              className="app-icon-button"
              onClick={() => navigate(backTo)}
              type="button"
            >←</button>
            ) : null}
          </div>
          <Link aria-label="Poom 홈으로" className="app-topbar-home-brand" to="/home"><Brand compact /></Link>
          <div className="app-topbar-actions">{actions}</div>
          {!homeBrandOnly && title && <h1 className="app-page-title app-topbar-title">{title}</h1>}
        </header>
        <main className={mapMode ? 'app-content app-content--map' : 'app-content'}>
          {children}
        </main>
      </div>
    </div>
  )
}

export function PageLoader({ label = '추억을 불러오고 있어요.' }: { label?: string }) {
  return (
    <div className="page-loader" role="status">
      <span aria-hidden="true" className="page-loader-orb">✦</span>
      <p>{label}</p>
    </div>
  )
}

export function ErrorNotice({ children }: PropsWithChildren) {
  return <p className="app-error" role="alert">{children}</p>
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <section className="empty-state">
      <span aria-hidden="true" className="empty-state-icon">✧</span>
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </section>
  )
}
