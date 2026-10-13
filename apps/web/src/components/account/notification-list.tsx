'use client';

import type { Notification } from '@myos/domain';
import Link from 'next/link';
import { useTransition } from 'react';
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '@/server/actions/account';
import { Button } from '../ui/button';

export function NotificationList({ items, timeZone }: { items: Notification[]; timeZone: string }) {
  const [pending, startTransition] = useTransition();
  const fmt = new Intl.DateTimeFormat('ko-KR', {
    timeZone,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          variant="secondary"
          disabled={pending || unread === 0}
          onClick={() => startTransition(async () => void (await markAllNotificationsReadAction()))}
        >
          모두 읽음으로 표시
        </Button>
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {items.length === 0 && (
          <li className="p-8 text-center text-sm text-muted">알림이 없습니다.</li>
        )}
        {items.map((n) => {
          const read = Boolean(n.readAt);
          const markRead = () =>
            !read && startTransition(async () => void (await markNotificationReadAction(n.id)));
          return (
            <li
              key={n.id}
              className={`flex items-start gap-3 px-4 py-3 ${read ? 'opacity-60' : ''}`}
            >
              <span
                className={`mt-1.5 size-2 shrink-0 rounded-full ${read ? 'bg-transparent' : 'bg-accent'}`}
                aria-label={read ? '읽음' : '읽지 않음'}
              />
              <div className="min-w-0 flex-1">
                {n.link ? (
                  <Link
                    href={n.link}
                    onClick={markRead}
                    className="text-sm font-medium hover:underline"
                  >
                    {n.title}
                  </Link>
                ) : (
                  <p className="text-sm font-medium">{n.title}</p>
                )}
                {n.message && <p className="mt-0.5 text-sm text-muted">{n.message}</p>}
                <p className="mt-1 text-xs text-muted">{fmt.format(n.createdAt)}</p>
              </div>
              {!read && (
                <Button variant="ghost" onClick={markRead} disabled={pending}>
                  읽음
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
