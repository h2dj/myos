import type { Metadata } from 'next';
import { listActivities, listLifeReviews } from '@myos/domain';
import { utcToLocalDate } from '@myos/core';
import { PageHeader } from '@/components/page-header';
import { LifeBalanceView } from '@/components/life-balance/life-balance-view';
import { requireSession } from '@/server/auth/session';
import { db } from '@/server/db';

export const metadata: Metadata = { title: '삶의 균형' };

export default async function LifeBalancePage() {
  const { actor, user, workspaces } = await requireSession();
  const personal = workspaces.find((w) => w.type === 'personal');
  if (!personal) return <p>개인 공간을 찾을 수 없습니다.</p>;
  const [activities, reviews] = await Promise.all([
    listActivities(db, actor, personal.id),
    listLifeReviews(db, actor),
  ]);
  return (
    <>
      <PageHeader
        title="삶의 균형"
        description="활동 기록과 나의 느낌을 함께 돌아보고, 다음 작은 행동을 정합니다."
      />
      <LifeBalanceView
        activities={activities.map((a) => ({ id: a.id, name: a.name }))}
        reviews={reviews}
        today={utcToLocalDate(new Date(), user.timezone)}
        timeZone={user.timezone}
      />
    </>
  );
}
