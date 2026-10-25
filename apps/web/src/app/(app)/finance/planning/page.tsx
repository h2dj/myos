import type { Metadata } from 'next';
import Link from 'next/link';
import {
  getFinanceForecast,
  listFinancePlans,
  getFinanceOverview,
  DomainError,
} from '@myos/domain';
import { utcToLocalDate } from '@myos/core';
import { PageHeader } from '@/components/page-header';
import { FinancePlanningView } from '@/components/finance/finance-planning-view';
import { requireSession } from '@/server/auth/session';
import { db } from '@/server/db';
export const metadata: Metadata = { title: '고정 지출·수지 예측' };
export default async function FinancePlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; until?: string; page?: string; plansPage?: string }>;
}) {
  const { actor, user } = await requireSession();
  const query = await searchParams;
  const today = utcToLocalDate(new Date(), user.timezone);
  const page = (raw?: string) =>
    raw && /^\d{1,6}$/.test(raw) && Number(raw) >= 1 && Number(raw) <= 100000 ? Number(raw) : 1;
  const [result, plans, overview] = await Promise.all([
    getFinanceForecast(db, actor, {
      period: query.period ?? 'monthEnd',
      ...(query.until ? { until: query.until } : {}),
      page: page(query.page),
    })
      .then((data) => ({ data, error: undefined as string | undefined }))
      .catch((error) => {
        if (error instanceof DomainError) return { data: null, error: error.message };
        throw error;
      }),
    listFinancePlans(db, actor, page(query.plansPage)),
    getFinanceOverview(db, actor, today.slice(0, 7)),
  ]);
  return (
    <>
      <Link href="/finance" className="text-sm text-muted">
        ← 재정 관리
      </Link>
      <PageHeader
        title="고정 지출·수지 예측"
        description="등록한 예정과 현재 잔액으로 기준 날짜까지의 수지를 계산합니다."
      />
      <FinancePlanningView
        forecast={result.data}
        error={result.error}
        plans={plans}
        accounts={overview.accounts}
        today={today}
      />
    </>
  );
}
