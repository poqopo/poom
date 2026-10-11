export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-lockup inline-flex items-center gap-3 ${compact ? 'brand-lockup--compact' : 'justify-center lg:justify-start'}`}>
      <img alt="Poom" className={compact ? 'brand-logo-image brand-logo-image--compact' : 'brand-logo-image'} src="/logo.png" />
      {!compact && <span className="text-left text-[11px] tracking-[0.12em] text-ink-subtle">마음을 천천히 건네는 곳</span>}
    </div>
  )
}
