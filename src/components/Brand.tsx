export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`inline-flex items-center gap-3 ${compact ? '' : 'justify-center lg:justify-start'}`}>
      <span aria-hidden="true" className="grid size-11 place-items-center rounded-2xl border border-white/80 bg-white/70 text-lg text-orange-700 shadow-glass">✳</span>
      <span className="text-left">
        <span className="block text-lg font-bold tracking-tight text-ink">poom</span>
        <span className="block text-[11px] tracking-[0.12em] text-ink-subtle">마음을 천천히 건네는 곳</span>
      </span>
    </div>
  )
}
