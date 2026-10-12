import type { Metadata } from 'next';
import { CheckSquare, Clock, FileText, Wallet } from 'lucide-react';
import { KpiCard } from '@/components/kpi-card';
import { QuickCapture } from '@/components/inbox/quick-capture';
import { PageHeader } from '@/components/page-header';
import { requireSession } from '@/server/auth/session';

export const metadata: Metadata = { title: '대시보드' };

/** KPI 카드는 뷰만 제공하고 데이터 소스는 사후 설정한다 (확정 사항 #4). */
const KPI_CARDS = [
  { title: '오늘 할 일', icon: CheckSquare },
  { title: '이번 주 집중 시간', icon: Clock },
  { title: '이번 달 지출', icon: Wallet },
  { title: '읽고 있는 문서', icon: FileText },
];

const WIDGET_SLOTS = ['오늘 할 일', '이번 주 일정', '최근 활동'];

export default async function DashboardPage() {
  const { user } = await requireSession();
  return (
    <>
      <PageHeader
        title={`좋은 하루예요, ${user.name}님! ☀️`}
        description="오늘도 한 걸음, 더 나아가요."
      />
      <section
        aria-label="핵심 지표"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {KPI_CARDS.map((c) => (
          <KpiCard key={c.title} title={c.title} icon={c.icon} />
        ))}
      </section>
      <section
        aria-label="위젯"
        className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4"
      >
        {WIDGET_SLOTS.map((title) => (
          <div key={title} className="min-h-48 rounded-xl border border-border bg-surface p-5">
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-2 text-sm text-muted">2단계에서 위젯으로 구현 예정</p>
          </div>
        ))}
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-3 font-semibold">메모 / 빠른 기록</h2>
          <QuickCapture source="dashboard" />
        </div>
      </section>
    </>
  );
}
