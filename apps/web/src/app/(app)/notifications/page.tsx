import { listNotifications } from '@myos/domain';
import type { Metadata } from 'next';
import { NotificationList } from '@/components/account/notification-list';
import { PageHeader } from '@/components/page-header';
import { requireSession } from '@/server/auth/session';
import { db } from '@/server/db';

export const metadata: Metadata = { title: '알림' };

export default async function NotificationsPage() {
  const { actor, user } = await requireSession();
  const items = await listNotifications(db, actor);
  return (
    <>
      <PageHeader title="알림" description="앱 내 알림을 확인하고 읽음 처리합니다." />
      <NotificationList items={items} timeZone={user.timezone} />
    </>
  );
}
