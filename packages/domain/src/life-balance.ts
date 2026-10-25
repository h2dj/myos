import {
  LIFE_FRAMEWORKS,
  normalizeLifeBalanceSnapshot,
  lifeAreaFor,
  localDateToUtc,
  shiftCalendarDate,
  scoreLifeBalance,
  utcToLocalDate,
  type LifeBalanceSnapshot,
  type LifeEvidence,
} from '@myos/core';
import { schema, type Db } from '@myos/db';
import { and, desc, eq, gte, isNull, lt } from 'drizzle-orm';
import { z } from 'zod';
import type { Actor, Executor } from './context';
import { requireAccess } from './access';
import { NotFoundError, ValidationError } from './errors';
import { isUuid, parse } from './validation';
import { tagsFor } from './tags';
import { recordAudit } from './audit';

export const lifeBalanceInputSchema = z
  .object({
    framework: z.enum(['wheel', 'perma']),
    from: z.iso.date(),
    to: z.iso.date(),
    selfWeight: z.number().int().min(0).max(100),
    areas: z
      .array(
        z
          .object({
            id: z.string().max(50),
            selfScore: z.number().min(0).max(10),
            target: z.number().int().min(1).max(10000),
            tag: z.string().trim().max(100),
            activityIds: z.array(z.uuid()).max(200),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    reflection: z.string().trim().max(3000),
    nextAction: z.string().trim().max(1000),
  })
  .strict()
  .superRefine((input, ctx) => {
    const expected = LIFE_FRAMEWORKS[input.framework].areas.map((a) => a.id);
    if (
      input.areas.length !== expected.length ||
      expected.some((id) => input.areas.filter((a) => a.id === id).length !== 1)
    )
      ctx.addIssue({ code: 'custom', message: '프레임워크의 모든 영역을 한 번씩 입력하세요.' });
    const activityIds = input.areas.flatMap((a) => a.activityIds);
    const tags = input.areas.map((a) => a.tag).filter(Boolean);
    if (new Set(activityIds).size !== activityIds.length || new Set(tags).size !== tags.length)
      ctx.addIssue({
        code: 'custom',
        message: '같은 태그나 활동을 여러 영역에 연결할 수 없습니다.',
      });
    const days = (Date.parse(input.to) - Date.parse(input.from)) / 86400000 + 1;
    if (days < 1 || days > 366 || input.from < '1900-01-01' || input.to > '2100-12-31')
      ctx.addIssue({
        code: 'custom',
        message: '기간은 시작일부터 종료일까지 1~366일로 지정하세요.',
      });
  });

async function personalWorkspace(db: Executor, actor: Actor) {
  const [workspace] = await db
    .select()
    .from(schema.workspaces)
    .where(
      and(
        eq(schema.workspaces.ownerId, actor.userId),
        eq(schema.workspaces.type, 'personal'),
        isNull(schema.workspaces.deletedAt),
      ),
    );
  if (!workspace) throw new NotFoundError('개인 공간');
  await requireAccess(db, actor, workspace.id, 'manage');
  return workspace;
}

export async function previewLifeBalance(
  db: Executor,
  actor: Actor,
  raw: unknown,
  now = new Date(),
) {
  const input = parse(lifeBalanceInputSchema, raw);
  const workspace = await personalWorkspace(db, actor);
  const [user] = await db
    .select({ timezone: schema.users.timezone })
    .from(schema.users)
    .where(eq(schema.users.id, actor.userId));
  if (!user) throw new NotFoundError('사용자');
  if (input.to > utcToLocalDate(now, user.timezone))
    throw new ValidationError('회고 종료일은 오늘 이후일 수 없습니다.');
  const activityIds = input.areas.flatMap((a) => a.activityIds);
  if (activityIds.length) {
    const activities = await db
      .select({ id: schema.activities.id })
      .from(schema.activities)
      .where(
        and(eq(schema.activities.workspaceId, workspace.id), isNull(schema.activities.deletedAt)),
      );
    if (activityIds.some((id) => !activities.some((a) => a.id === id)))
      throw new ValidationError('개인 공간의 사용 중인 활동만 연결할 수 있습니다.');
  }
  const tasks = await db
    .select({
      id: schema.tasks.id,
      title: schema.tasks.title,
      completedAt: schema.tasks.completedAt,
      activityId: schema.tasks.activityId,
    })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.workspaceId, workspace.id),
        eq(schema.tasks.status, 'done'),
        isNull(schema.tasks.deletedAt),
        gte(schema.tasks.completedAt, localDateToUtc(input.from, user.timezone)),
        lt(schema.tasks.completedAt, localDateToUtc(shiftCalendarDate(input.to, 1), user.timezone)),
      ),
    )
    .orderBy(desc(schema.tasks.completedAt))
    .limit(10001);
  if (tasks.length > 10000)
    throw new ValidationError('기간 내 완료 기록이 10,000건을 초과합니다. 기간을 줄여 주세요.');
  const tags = await tagsFor(
    db,
    'task',
    tasks.map((t) => t.id),
  );
  const evidence: LifeEvidence[] = tasks.map((t) => ({
    ...t,
    completedAt: t.completedAt!.toISOString(),
    tags: (tags.get(t.id) ?? []).map((tag) => tag.name),
  }));
  return {
    snapshot: scoreLifeBalance(input, evidence, user.timezone),
    evidence: evidence.slice(0, 100).map((t) => ({ ...t, areaId: lifeAreaFor(t, input.areas) })),
  };
}

export async function saveLifeBalance(db: Db, actor: Actor, raw: unknown, requestId: string) {
  if (!isUuid(requestId)) throw new ValidationError('저장 요청 ID가 올바르지 않습니다.');
  return db.transaction(
    async (tx) => {
      const workspace = await personalWorkspace(tx, actor);
      const [existing] = await tx
        .select()
        .from(schema.lifeReviews)
        .where(
          and(eq(schema.lifeReviews.id, requestId), eq(schema.lifeReviews.userId, actor.userId)),
        );
      if (existing) return existing;
      const { snapshot } = await previewLifeBalance(tx, actor, raw);
      const [saved] = await tx
        .insert(schema.lifeReviews)
        .values({
          id: requestId,
          workspaceId: workspace.id,
          userId: actor.userId,
          snapshot: snapshot as unknown as Record<string, unknown>,
        })
        .onConflictDoNothing()
        .returning();
      if (!saved) throw new ValidationError('같은 저장 요청이 처리 중입니다. 다시 확인해 주세요.');
      await recordAudit(tx, actor, {
        workspaceId: workspace.id,
        action: 'life.review.create',
        entityType: 'lifeReview',
        entityId: saved.id,
      });
      return saved;
    },
    { isolationLevel: 'repeatable read' },
  );
}

export async function listLifeReviews(db: Executor, actor: Actor) {
  const workspace = await personalWorkspace(db, actor);
  const rows = await db
    .select()
    .from(schema.lifeReviews)
    .where(
      and(
        eq(schema.lifeReviews.workspaceId, workspace.id),
        eq(schema.lifeReviews.userId, actor.userId),
      ),
    )
    .orderBy(desc(schema.lifeReviews.createdAt), desc(schema.lifeReviews.id))
    .limit(50);
  return rows.map((row) => ({
    ...row,
    snapshot: normalizeLifeBalanceSnapshot(row.snapshot as unknown as LifeBalanceSnapshot),
  }));
}

export async function deleteLifeReview(db: Executor, actor: Actor, id: string) {
  if (!isUuid(id)) throw new NotFoundError('회고');
  const workspace = await personalWorkspace(db, actor);
  const rows = await db
    .delete(schema.lifeReviews)
    .where(
      and(
        eq(schema.lifeReviews.id, id),
        eq(schema.lifeReviews.userId, actor.userId),
        eq(schema.lifeReviews.workspaceId, workspace.id),
      ),
    )
    .returning({ id: schema.lifeReviews.id });
  if (!rows.length) throw new NotFoundError('회고');
}
