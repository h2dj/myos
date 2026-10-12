import type { LucideIcon } from 'lucide-react';

/**
 * 대시보드 KPI 숫자 카드.
 * value가 없으면 "데이터 미설정" 상태로 표시한다(데이터 소스는 사후 설정).
 */
export function KpiCard({
  title,
  icon: Icon,
  value,
  hint,
}: {
  title: string;
  icon: LucideIcon;
  value?: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between rounded-xl border border-border bg-surface p-5">
      <div>
        <p className="text-sm text-muted">{title}</p>
        <p className={`mt-2 text-2xl font-bold ${value ? '' : 'text-muted'}`}>{value ?? '—'}</p>
        <p className="mt-1 text-xs text-muted">{hint ?? (value ? '' : '데이터 소스 미설정')}</p>
      </div>
      <Icon className="size-6 text-accent" aria-hidden />
    </div>
  );
}
