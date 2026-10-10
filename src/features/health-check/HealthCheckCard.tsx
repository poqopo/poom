import { isSupabaseConfigured } from '../../lib/supabase'
import { useHealthCheck } from './useHealthCheck'

export function HealthCheckCard() {
  const healthCheck = useHealthCheck()

  let detail = 'Supabase 환경변수를 설정하면 함수를 호출합니다.'
  let state = '설정 필요'
  let tone = 'bg-amber-50 text-amber-800 ring-amber-200'

  if (isSupabaseConfigured && healthCheck.isPending) {
    detail = 'health-check 함수를 호출하고 있습니다.'
    state = '호출 중'
    tone = 'bg-sky-50 text-sky-800 ring-sky-200'
  } else if (healthCheck.isSuccess) {
    detail = `${healthCheck.data.service} · ${new Date(healthCheck.data.timestamp).toLocaleString()}`
    state = '정상'
    tone = 'bg-emerald-50 text-emerald-800 ring-emerald-200'
  } else if (healthCheck.isError) {
    detail = healthCheck.error.message
    state = '오류'
    tone = 'bg-rose-50 text-rose-800 ring-rose-200'
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">Edge Function</p>
          <p className="mt-1 text-sm text-slate-500">health-check 호출 결과</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${tone}`}>
          {state}
        </span>
      </div>
      <p className="mt-5 break-words text-sm leading-6 text-slate-600">{detail}</p>
      {healthCheck.isError && isSupabaseConfigured && (
        <button
          className="mt-4 text-sm font-semibold text-indigo-700 underline decoration-indigo-300 underline-offset-4"
          onClick={() => void healthCheck.refetch()}
          type="button"
        >
          다시 호출
        </button>
      )}
    </section>
  )
}
