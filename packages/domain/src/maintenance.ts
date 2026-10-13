import { schema } from '@myos/db';
import { and, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import type { Executor } from './context';

const DAY = 86_400_000;

/** 보존 기간 (확정 사항 #7) */
export const RETENTION = {
  trashDays: 30,
  automationRunDays: 90,
  readNotificationDays: 90,
  auditLogDays: 365,
} as const;

/** 보존 기간이 지난 데이터 영구 삭제 (워커가 하루 한 번 실행) */
export async function purgeExpired(db: Executor, now = new Date()) {
  const before = (days: number) => new Date(now.getTime() - days * DAY);
  return db.transaction(async (tx) => {
    const trashCutoff = before(RETENTION.trashDays);
    const purged: Record<string, number> = {};

    for (const [name, table, type] of [
      ['tasks', schema.tasks, 'task'],
      ['notes', schema.notes, 'note'],
      ['projects', schema.projects, 'project'],
    ] as const) {
      const rows = await tx
        .delete(table)
        .where(and(isNotNull(table.deletedAt), lt(table.deletedAt, trashCutoff)))
        .returning({ id: table.id });
      purged[name] = rows.length;
      const ids = rows.map((r) => r.id);
      if (ids.length) {
        // 태그·연결은 FK가 없으므로 함께 정리
        await tx
          .delete(schema.entityTags)
          .where(
            and(
              sql`${schema.entityTags.entityType} = ${type}`,
              inArray(schema.entityTags.entityId, ids),
            ),
          );
        await tx.delete(schema.entityLinks).where(
          sql`(${schema.entityLinks.sourceType} = ${type} and ${inArray(schema.entityLinks.sourceId, ids)})
              or (${schema.entityLinks.targetType} = ${type} and ${inArray(schema.entityLinks.targetId, ids)})`,
        );
      }
    }

    purged.automationRuns = (
      await tx
        .delete(schema.automationRuns)
        .where(lt(schema.automationRuns.startedAt, before(RETENTION.automationRunDays)))
        .returning({ id: schema.automationRuns.id })
    ).length;
    purged.notifications = (
      await tx
        .delete(schema.notifications)
        .where(
          and(
            isNotNull(schema.notifications.readAt),
            lt(schema.notifications.readAt, before(RETENTION.readNotificationDays)),
          ),
        )
        .returning({ id: schema.notifications.id })
    ).length;
    purged.auditLogs = (
      await tx
        .delete(schema.auditLogs)
        .where(lt(schema.auditLogs.createdAt, before(RETENTION.auditLogDays)))
        .returning({ id: schema.auditLogs.id })
    ).length;
    return purged;
  });
}
