import { schema } from '@myos/db';
import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import { can } from '@myos/core';
import { requireAccess } from './access';
import { recordAudit } from './audit';
import type { Actor, Executor } from './context';
import { NotFoundError } from './errors';
import { createTask } from './tasks';
import { isUuid, parse } from './validation';

const { tasks, entityLinks } = schema;

/** before: 현재 작업보다 먼저 할 이전 작업, after: 현재 작업 다음에 할 후속 작업 */
export type TaskSequenceDirection = 'before' | 'after';

export const TASK_SEQUENCE_SUFFIX: Record<TaskSequenceDirection, string> = {
  before: '(이전)',
  after: '(후속)',
};

const TITLE_MAX = 300;

/** 현재 제목 뒤에 (이전)/(후속)을 붙인다. 제목 길이 제한을 넘으면 원래 제목을 줄인다. */
export function sequenceTaskTitle(title: string, direction: TaskSequenceDirection) {
  const suffix = ` ${TASK_SEQUENCE_SUFFIX[direction]}`;
  const base = title
    .trim()
    .slice(0, TITLE_MAX - suffix.length)
    .trimEnd();
  return `${base}${suffix}`;
}

export interface TaskSequenceItem {
  linkId: string;
  id: string;
  title: string;
  status: (typeof tasks.status.enumValues)[number];
}

async function loadLiveTask(db: Executor, taskId: string) {
  if (!isUuid(taskId)) throw new NotFoundError('할 일');
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt)));
  if (!task) throw new NotFoundError('할 일');
  return task;
}

/**
 * 현재 할 일의 이전 또는 후속 작업을 만든다. 프로젝트·상시 사업/활동(과 그 활동처)을 공유하고
 * 제목은 현재 제목에 (이전)/(후속)을 붙인다. 두 할 일은 precedes 연결로 선후 관계를 남긴다.
 */
export async function createSequenceTask(
  db: Executor,
  actor: Actor,
  taskId: string,
  direction: TaskSequenceDirection,
) {
  parse(z.enum(['before', 'after']), direction);
  return db.transaction(async (tx) => {
    const current = await loadLiveTask(tx, taskId);
    await requireAccess(tx, actor, current.workspaceId, 'write');
    const created = await createTask(tx, actor, {
      workspaceId: current.workspaceId,
      title: sequenceTaskTitle(current.title, direction),
      projectId: current.projectId,
      activityId: current.activityId,
      activityPlaceId: current.activityPlaceId,
      status: 'todo',
    });
    const [prev, next] = direction === 'before' ? [created, current] : [current, created];
    const [link] = await tx
      .insert(entityLinks)
      .values({
        workspaceId: current.workspaceId,
        sourceType: 'task',
        sourceId: prev.id,
        targetType: 'task',
        targetId: next.id,
        linkType: 'precedes',
      })
      .returning();
    await recordAudit(tx, actor, {
      workspaceId: current.workspaceId,
      action: `task.sequence.${direction}`,
      entityType: 'task',
      entityId: current.id,
      metadata: { taskId: created.id, relationId: link!.id },
    });
    return created;
  });
}

/** 할 일의 이전·후속 작업 목록 (휴지통에 있는 할 일은 제외) */
export async function getTaskSequence(db: Executor, actor: Actor, taskId: string) {
  const current = await loadLiveTask(db, taskId);
  const role = await requireAccess(db, actor, current.workspaceId, 'read');
  const rows = await db
    .select()
    .from(entityLinks)
    .where(
      and(
        eq(entityLinks.workspaceId, current.workspaceId),
        eq(entityLinks.linkType, 'precedes'),
        eq(entityLinks.sourceType, 'task'),
        eq(entityLinks.targetType, 'task'),
        or(eq(entityLinks.sourceId, current.id), eq(entityLinks.targetId, current.id)),
      ),
    )
    .orderBy(asc(entityLinks.createdAt), asc(entityLinks.id));
  const otherIds = rows.map((r) => (r.sourceId === current.id ? r.targetId : r.sourceId));
  const others = otherIds.length
    ? await db
        .select({ id: tasks.id, title: tasks.title, status: tasks.status })
        .from(tasks)
        .where(
          and(
            eq(tasks.workspaceId, current.workspaceId),
            isNull(tasks.deletedAt),
            inArray(tasks.id, otherIds),
          ),
        )
    : [];
  const byId = new Map(others.map((t) => [t.id, t]));
  const previous: TaskSequenceItem[] = [];
  const next: TaskSequenceItem[] = [];
  for (const row of rows) {
    const isPrevious = row.targetId === current.id;
    const other = byId.get(isPrevious ? row.sourceId : row.targetId);
    if (!other) continue;
    (isPrevious ? previous : next).push({ linkId: row.id, ...other });
  }
  return { canWrite: can(role, 'write'), previous, next };
}
