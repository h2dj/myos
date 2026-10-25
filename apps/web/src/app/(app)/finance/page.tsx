import type { Metadata } from 'next';
import { getFinanceOverview } from '@myos/domain';
import { utcToLocalDate } from '@myos/core';
import { PageHeader } from '@/components/page-header';
import { FinanceView } from '@/components/finance/finance-view';
import { requireSession } from '@/server/auth/session';
import { db } from '@/server/db';

export const metadata: Metadata = { title: '재정 관리' };
export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; page?: string; view?: string }>;
}) {
  const { actor, user } = await requireSession();
  const params = await searchParams;
  const today = utcToLocalDate(new Date(), user.timezone);
  const month =
    params.month && /^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(params.month)
      ? params.month
      : today.slice(0, 7);
  const page =
    params.page &&
    /^\d{1,6}$/.test(params.page) &&
    Number(params.page) >= 1 &&
    Number(params.page) <= 100000
      ? Number(params.page)
      : 1;
  const overview = await getFinanceOverview(db, actor, month, page, params.view === 'trash');
  return (
    <>
      <PageHeader
        title="재정 관리"
        description="개인 공간의 원화 수입·지출·이체와 월 예산을 기록합니다."
      />
      <FinanceView overview={overview} today={today} timeZone={user.timezone} />
    </>
  );
}
