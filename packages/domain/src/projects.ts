import { schema } from '@myos/db';
import { and, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { requireAccess } from './access';
import { recordAudit } from './audit';
import type { Actor, Executor } from './context';
import { NotFoundError, ValidationError } from './errors';
import { isUuid, parse } from './validation';

const { projects, tasks, workspaces } = schema;

export type Project = typeof projects.$inferSelect;
export type ProjectStatus = Project['status'];
export type ProjectWithProgress = Project & {
  taskTotal: number;
  taskDone: number;
  progress: number;
};

const fields = {
  parentId: z.uuid().nullable().optional(),
  name: z.string().trim().min(1, '이름을 입력하세요').max(200),
  description: z.string().max(10_000).nullable().optional(),
  status: z.enum(projects.status.enumValues).optional(),
  startAt: z.coerce.date().nullable().optional(),
  dueAt: z.coerce.date().nullable().optional(),
};
const createInput = z.object({ workspaceId: z.uuid(), ...fields });
const updateInput = z.object(fields).partial();

export async function createProject(
  db: Executor,
  actor: Actor,
  input: z.input<typeof createInput>,
) {
  const { workspaceId, ...data } = parse(createInput, input);
  validateRange(data.startAt, data.dueAt);
  return db.transaction(async (tx) => {
    await requireAccess(tx, actor, workspaceId, 'write');
    await lockHierarchy(tx, workspaceId);
    await validateParent(tx, workspaceId, data.parentId);
    const [project] = await tx
      .insert(projects)
      .values({ ...data, workspaceId, createdBy: actor.userId })
      .returning();
    await recordAudit(tx, actor, {
      workspaceId,
      action: 'project.create',
      entityType: 'project',
      entityId: project!.id,
    });
    return project!;
  });
}

export async function updateProject(
  db: Executor,
  actor: Actor,
  projectId: string,
  input: z.input<typeof updateInput>,
) {
  const data = parse(updateInput, input);
  return db.transaction(async (tx) => {
    const current = await loadProject(tx, projectId);
    await requireAccess(tx, actor, current.workspaceId, 'write');
    await lockHierarchy(tx, current.workspaceId);
    await validateParent(tx, current.workspaceId, data.parentId, projectId);
    validateRange(
      data.startAt === undefined ? current.startAt : data.startAt,
      data.dueAt === undefined ? current.dueAt : data.dueAt,
    );
    const [project] = await tx
      .update(projects)
      .set(data)
      .where(eq(projects.id, projectId))
      .returning();
    await recordAudit(tx, actor, {
      workspaceId: current.workspaceId,
      action: 'project.update',
      entityType: 'project',
      entityId: projectId,
    });
    return project!;
  });
}

/** 휴지통으로 이동. 소속 할 일은 그대로 두고 프로젝트 연결만 화면에서 숨겨진다. */
export async function deleteProject(db: Executor, actor: Actor, projectId: string) {
  await db.transaction(async (tx) => {
    const current = await loadProject(tx, projectId);
    await requireAccess(tx, actor, current.workspaceId, 'write');
    await lockHierarchy(tx, current.workspaceId);
    await tx.update(projects).set({ parentId: null }).where(eq(projects.parentId, projectId));
    await tx.update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, projectId));
    await recordAudit(tx, actor, {
      workspaceId: current.workspaceId,
      action: 'project.delete',
      entityType: 'project',
      entityId: projectId,
    });
  });
}

export async function restoreProject(db: Executor, actor: Actor, projectId: string) {
  return db.transaction(async (tx) => {
    const current = await loadProject(tx, projectId, { includeDeleted: true });
    await requireAccess(tx, actor, current.workspaceId, 'write');
    const [project] = await tx
      .update(projects)
      .set({ deletedAt: null, parentId: null })
      .where(eq(projects.id, projectId))
      .returning();
    return project!;
  });
}

export async function getProject(
  db: Executor,
  actor: Actor,
  projectId: string,
): Promise<ProjectWithProgress> {
  const project = await loadProject(db, projectId);
  await requireAccess(db, actor, project.workspaceId, 'read');
  const [withProgress] = await attachProgress(db, [project]);
  return withProgress!;
}

const listInput = z.object({
  workspaceId: z.uuid(),
  status: z.array(z.enum(projects.status.enumValues)).optional(),
});

export async function listProjects(
  db: Executor,
  actor: Actor,
  input: z.input<typeof listInput>,
): Promise<ProjectWithProgress[]> {
  const q = parse(listInput, input);
  await requireAccess(db, actor, q.workspaceId, 'read');
  const rows = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, q.workspaceId),
        isNull(projects.deletedAt),
        q.status ? inArray(projects.status, q.status) : undefined,
      ),
    )
    .orderBy(sql`${projects.dueAt} asc nulls last`, desc(projects.createdAt));
  return attachProgress(db, rows);
}

/** 진행률 = 완료 / (취소 제외 전체) */
async function attachProgress(db: Executor, rows: Project[]): Promise<ProjectWithProgress[]> {
  if (rows.length === 0) return [];
  const stats = await db
    .select({
      projectId: tasks.projectId,
      total: count(),
      done: sql<number>`count(*) filter (where ${tasks.status} = 'done')`.mapWith(Number),
    })
    .from(tasks)
    .where(
      and(
        inArray(
          tasks.projectId,
          rows.map((r) => r.id),
        ),
        isNull(tasks.deletedAt),
        sql`${tasks.status} <> 'cancelled'`,
      ),
    )
    .groupBy(tasks.projectId);
  const byId = new Map(stats.map((s) => [s.projectId, s]));
  return rows.map((r) => {
    const s = byId.get(r.id);
    const taskTotal = s?.total ?? 0;
    const taskDone = s?.done ?? 0;
    return {
      ...r,
      taskTotal,
      taskDone,
      progress: taskTotal ? Math.round((taskDone / taskTotal) * 100) : 0,
    };
  });
}

async function loadProject(db: Executor, id: string, opts: { includeDeleted?: boolean } = {}) {
  if (!isUuid(id)) throw new NotFoundError('프로젝트');
  const [p] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), opts.includeDeleted ? undefined : isNull(projects.deletedAt)));
  if (!p) throw new NotFoundError('프로젝트');
  return p;
}

function validateRange(start: Date | null | undefined, end: Date | null | undefined) {
  if (start && end && end < start) throw new ValidationError('마감일이 시작일보다 빠릅니다.');
}

// 같은 공간의 구조 변경을 직렬화해 동시 수정으로 생기는 순환도 막는다.
async function lockHierarchy(db: Executor, workspaceId: string) {
  await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .for('update');
}

async function validateParent(
  db: Executor,
  workspaceId: string,
  parentId?: string | null,
  projectId?: string,
) {
  if (!parentId) return;
  const rows = await db
    .select({ id: projects.id, parentId: projects.parentId })
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), isNull(projects.deletedAt)));
  const parents = new Map(rows.map((p) => [p.id, p.parentId]));
  if (!parents.has(parentId))
    throw new ValidationError('같은 공간의 프로젝트만 상위 프로젝트로 지정할 수 있습니다.');
  const visited = new Set<string>(projectId ? [projectId] : []);
  let id: string | null | undefined = parentId;
  while (id) {
    if (visited.has(id))
      throw new ValidationError(
        '프로젝트가 자기 자신 또는 하위 프로젝트를 상위로 가질 수 없습니다.',
      );
    visited.add(id);
    id = parents.get(id);
  }
}
