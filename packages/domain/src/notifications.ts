import { schema } from '@myos/db';
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import type { Actor, Executor } from './context';

const { notifications } = schema;

export type Notification = typeof notifications.$inferSelect;

/** 시스템(자동화·공유 등)이 사용자에게 알림을 남긴다. 권한 검사는 호출 측 책임. */
export async function notify(
  db: Executor,
  input: {
    userId: string;
    workspaceId?: string | null;
    type: string;
    title: string;
    message?: string | null;
    link?: string | null;
    data?: Record<string, unknown>;
  },
) {
  const [n] = await db.insert(notifications).values(input).returning();
  return n!;
}

export async function listNotifications(
  db: Executor,
  actor: Actor,
  opts: { unreadOnly?: boolean; limit?: number } = {},
) {
  return db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, actor.userId),
        opts.unreadOnly ? isNull(notifications.readAt) : undefined,
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(opts.limit ?? 100);
}

export async function unreadNotificationCount(db: Executor, actor: Actor): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, actor.userId), isNull(notifications.readAt)));
  return row?.n ?? 0;
}

/** 본인 알림만 읽음 처리된다 (다른 사용자 알림 id는 무시) */
export async function markNotificationRead(db: Executor, actor: Actor, id: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.userId, actor.userId),
        isNull(notifications.readAt),
      ),
    );
}

export async function markAllNotificationsRead(db: Executor, actor: Actor) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, actor.userId), isNull(notifications.readAt)));
}
