import { schema } from '@myos/db';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { z } from 'zod';
import { assertProjectInWorkspace, requireAccess } from './access';
import { recordAudit } from './audit';
import type { Actor, Executor } from './context';
import { NotFoundError, ValidationError } from './errors';
import { replaceEntityTags, tagNamesSchema, tagsFor, type TagRef } from './tags';
import { parse } from './validation';

const { tasks, projects } = schema;

export type Task = typeof tasks.$inferSelect;
export type TaskStatus = Task['status'];
export type TaskWithTags = Task & { tags: TagRef[]; projectName: string | null };

const optionalDate = z.coerce.date().nullable().optional();

const taskFields = {
  title: z.string().trim().min(1, '제목을 입력하세요').max(300),
  description: z.string().max(10_000).nullable().optional(),
  status: z.enum(tasks.status.enumValues).optional(),
  priority: z.enum(tasks.priority.enumValues).optional(),
  projectId: z.uuid().nullable().optional(),
  scheduledStart: optionalDate,
  scheduledEnd: optionalDate,
  allDay: z.boolean().optional(),
  dueAt: optionalDate,
  assigneeId: z.uuid().nullable().optional(),
  tags: tagNamesSchema.optional(),
};

const createInput = z.object({ workspaceId: z.uuid(), ...taskFields });
const updateInput = z.object(taskFields).partial();

export async function createTask(db: Executor, actor: Actor, input: z.input<typeof createInput>) {
  const { workspaceId, tags, ...data } = parse(createInput, input);
  validateRange(data.scheduledStart, data.scheduledEnd);

  return db.transaction(async (tx) => {
    await requireAccess(tx, actor, workspaceId, 'write');
    if (data.projectId) await assertProjectInWorkspace(tx, data.projectId, workspaceId);

    const [task] = await tx
      .insert(tasks)
      .values({
        ...data,
        workspaceId,
        completedAt: data.status === 'done' ? new Date() : null,
        createdBy: actor.userId,
      })
      .returning();
    if (!task) throw new Error('할 일 생성 실패');
    if (tags) await replaceEntityTags(tx, workspaceId, 'task', task.id, tags);
    await recordAudit(tx, actor, {
      workspaceId,
      action: 'task.create',
      entityType: 'task',
      entityId: task.id,
    });
    return task;
  });
}

export async function updateTask(
  db: Executor,
  actor: Actor,
  taskId: string,
  input: z.input<typeof updateInput>,
) {
  const { tags, ...data } = parse(updateInput, input);

  return db.transaction(async (tx) => {
    const current = await loadTask(tx, taskId);
    await requireAccess(tx, actor, current.workspaceId, 'write');
    if (data.projectId) await assertProjectInWorkspace(tx, data.projectId, current.workspaceId);
    validateRange(
      data.scheduledStart === undefined ? current.scheduledStart : data.scheduledStart,
      data.scheduledEnd === undefined ? current.scheduledEnd : data.scheduledEnd,
    );

    const completedAt =
      data.status === undefined
        ? undefined
        : data.status === 'done'
          ? (current.completedAt ?? new Date())
          : null;

    const [task] = await tx
      .update(tasks)
      .set({ ...data, ...(completedAt !== undefined && { completedAt }) })
      .where(eq(tasks.id, taskId))
      .returning();
    if (tags) await replaceEntityTags(tx, current.workspaceId, 'task', taskId, tags);
    return task!;
  });
}

export function setTaskStatus(db: Executor, actor: Actor, taskId: string, status: TaskStatus) {
  return updateTask(db, actor, taskId, { status });
}

/** 휴지통으로 이동 (복구 가능) */
export async function deleteTask(db: Executor, actor: Actor, taskId: string) {
  await db.transaction(async (tx) => {
    const current = await loadTask(tx, taskId);
    await requireAccess(tx, actor, current.workspaceId, 'write');
    await tx.update(tasks).set({ deletedAt: new Date() }).where(eq(tasks.id, taskId));
    await recordAudit(tx, actor, {
      workspaceId: current.workspaceId,
      action: 'task.delete',
      entityType: 'task',
      entityId: taskId,
    });
  });
}

export async function restoreTask(db: Executor, actor: Actor, taskId: string) {
  return db.transaction(async (tx) => {
    const current = await loadTask(tx, taskId, { includeDeleted: true });
    await requireAccess(tx, actor, current.workspaceId, 'write');
    const [task] = await tx
      .update(tasks)
      .set({ deletedAt: null })
      .where(eq(tasks.id, taskId))
      .returning();
    await recordAudit(tx, actor, {
      workspaceId: current.workspaceId,
      action: 'task.restore',
      entityType: 'task',
      entityId: taskId,
    });
    return task!;
  });
}

export async function getTask(db: Executor, actor: Actor, taskId: string): Promise<TaskWithTags> {
  const task = await loadTask(db, taskId);
  await requireAccess(db, actor, task.workspaceId, 'read');
  const [withTags] = await attachExtras(db, [task]);
  return withTags!;
}

const listInput = z.object({
  workspaceId: z.uuid(),
  projectId: z.uuid().optional(),
  status: z.array(z.enum(tasks.status.enumValues)).optional(),
  /** 기준 날짜(예정일 또는 마감일)가 이 범위에 있는 할 일 */
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  /** 완료된 일은 이 시각 이후 완료분만 포함 (예: 오늘 완료한 일) */
  completedSince: z.coerce.date().optional(),
  trash: z.boolean().optional(),
  limit: z.number().int().min(1).max(500).default(200),
});

export async function listTasks(
  db: Executor,
  actor: Actor,
  input: z.input<typeof listInput>,
): Promise<TaskWithTags[]> {
  const q = parse(listInput, input);
  await requireAccess(db, actor, q.workspaceId, 'read');

  const anchor = sql`coalesce(${tasks.scheduledStart}, ${tasks.dueAt})`;
  const where: (SQL | undefined)[] = [
    eq(tasks.workspaceId, q.workspaceId),
    q.trash ? isNotNull(tasks.deletedAt) : isNull(tasks.deletedAt),
    q.projectId ? eq(tasks.projectId, q.projectId) : undefined,
    q.status ? inArray(tasks.status, q.status) : undefined,
    // 계산식 비교는 drizzle이 Date를 직렬화하지 않으므로 ISO 문자열로 넘긴다
    q.from ? sql`${anchor} >= ${q.from.toISOString()}::timestamptz` : undefined,
    q.to ? sql`${anchor} <= ${q.to.toISOString()}::timestamptz` : undefined,
    q.completedSince
      ? or(
          notInArray(tasks.status, ['done', 'cancelled']),
          gte(tasks.completedAt, q.completedSince),
        )
      : undefined,
  ];

  const rows = await db
    .select()
    .from(tasks)
    .where(and(...where))
    .orderBy(
      q.trash ? desc(tasks.deletedAt) : sql`${anchor} asc nulls last`,
      asc(tasks.sortOrder),
      asc(tasks.createdAt),
    )
    .limit(q.limit);

  return attachExtras(db, rows);
}

async function attachExtras(db: Executor, rows: Task[]): Promise<TaskWithTags[]> {
  const tagMap = await tagsFor(
    db,
    'task',
    rows.map((r) => r.id),
  );
  const projectIds = [...new Set(rows.map((r) => r.projectId).filter((id) => id !== null))];
  const names = new Map<string, string>();
  if (projectIds.length) {
    const ps = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(inArray(projects.id, projectIds));
    for (const p of ps) names.set(p.id, p.name);
  }
  return rows.map((r) => ({
    ...r,
    tags: tagMap.get(r.id) ?? [],
    projectName: r.projectId ? (names.get(r.projectId) ?? null) : null,
  }));
}

async function loadTask(db: Executor, taskId: string, opts: { includeDeleted?: boolean } = {}) {
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), opts.includeDeleted ? undefined : isNull(tasks.deletedAt)));
  if (!task) throw new NotFoundError('할 일');
  return task;
}

function validateRange(start: Date | null | undefined, end: Date | null | undefined) {
  if (start && end && end < start) throw new ValidationError('종료일이 시작일보다 빠릅니다.');
}
