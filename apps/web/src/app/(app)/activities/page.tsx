import type { Metadata } from 'next';
import { listActivities, listActivityPlaces } from '@myos/domain';
import { PageHeader } from '@/components/page-header';
import { ActivityManager } from '@/components/activities/activity-manager';
import { requireSession } from '@/server/auth/session';
import { db } from '@/server/db';
export const metadata: Metadata = { title: '사업·활동 및 활동처' };
export default async function ActivitiesPage() {
  const { actor, workspace } = await requireSession();
  const [activities, places] = await Promise.all([
    listActivities(db, actor, workspace.id),
    listActivityPlaces(db, actor, workspace.id),
  ]);
  return (
    <>
      <PageHeader
        title="사업·활동 및 활동처"
        description="기한 없이 이어지는 활동과 활동처를 관리합니다."
      />
      <ActivityManager activities={activities} places={places} />
    </>
  );
}
