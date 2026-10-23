import { schema } from '@myos/db';
import { eq, inArray } from 'drizzle-orm';
import type { Db } from '@myos/db';
import type { Actor } from '../context';
import { requireAccess } from '../access';
import { ValidationError } from '../errors';
import { MAX_BACKUP_BYTES, MAX_BACKUP_ROWS, sealWorkspaceBackup } from './format';

/** 반복 가능한 읽기 스냅샷. 소유자의 현재 공간 업무 데이터만 포함한다. */
export async function exportWorkspaceBackup(db: Db, actor: Actor, workspaceId: string) {
  const backup = await db.transaction(
    async (tx) => {
      await requireAccess(tx, actor, workspaceId, 'manage');
      const [workspace] = await tx
        .select()
        .from(schema.workspaces)
        .where(eq(schema.workspaces.id, workspaceId));
      const limit = MAX_BACKUP_ROWS + 1;
      const [places, activities, projects, series, tasks, notes, inbox, tags, links] =
        await Promise.all([
          tx
            .select()
            .from(schema.activityPlaces)
            .where(eq(schema.activityPlaces.workspaceId, workspaceId))
            .limit(limit),
          tx
            .select()
            .from(schema.activities)
            .where(eq(schema.activities.workspaceId, workspaceId))
            .limit(limit),
          tx
            .select()
            .from(schema.projects)
            .where(eq(schema.projects.workspaceId, workspaceId))
            .limit(limit),
          tx
            .select()
            .from(schema.taskSeries)
            .where(eq(schema.taskSeries.workspaceId, workspaceId))
            .limit(limit),
          tx
            .select()
            .from(schema.tasks)
            .where(eq(schema.tasks.workspaceId, workspaceId))
            .limit(limit),
          tx
            .select()
            .from(schema.notes)
            .where(eq(schema.notes.workspaceId, workspaceId))
            .limit(limit),
          tx
            .select()
            .from(schema.inboxItems)
            .where(eq(schema.inboxItems.workspaceId, workspaceId))
            .limit(limit),
          tx
            .select()
            .from(schema.tags)
            .where(eq(schema.tags.workspaceId, workspaceId))
            .limit(limit),
          tx
            .select()
            .from(schema.entityLinks)
            .where(eq(schema.entityLinks.workspaceId, workspaceId))
            .limit(limit),
        ]);
      const entityTags = tags.length
        ? await tx
            .select()
            .from(schema.entityTags)
            .where(
              inArray(
                schema.entityTags.tagId,
                tx
                  .select({ id: schema.tags.id })
                  .from(schema.tags)
                  .where(eq(schema.tags.workspaceId, workspaceId)),
              ),
            )
            .limit(limit)
        : [];
      // Date를 명시적인 ISO 문자열로 바꿔 파일 형식을 고정한다.
      return sealWorkspaceBackup(
        JSON.parse(
          JSON.stringify({
            format: 'myos-workspace',
            version: 1,
            exportedAt: new Date().toISOString(),
            workspace,
            tables: {
              places,
              activities,
              projects,
              series,
              tasks,
              notes,
              inbox,
              tags,
              entityTags,
              links,
            },
          }),
        ),
      );
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
  if (Buffer.byteLength(JSON.stringify(backup), 'utf8') > MAX_BACKUP_BYTES)
    throw new ValidationError('내보내기 크기 제한(20MiB)을 초과했습니다.');
  return backup;
}
