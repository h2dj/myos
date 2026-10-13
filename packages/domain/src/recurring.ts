import {
  addDaysToDate,
  localDateToUtc,
  nextOccurrenceAfter,
  occurrencesBetween,
  occursOn,
  type RecurrenceRule,
} from '@myos/core';
import { schema } from '@myos/db';
import { and, eq, isNotNull, lte } from 'drizzle-orm';
import { z } from 'zod';
import { assertProjectInWorkspace, requireAccess } from './access';
import { recordAudit } from './audit';
import type { Actor, Executor } from './context';
import { NotFoundError } from './errors';
import { replaceEntityTags, tagNamesSchema } from './tags';
import { isUuid, parse } from './validation';

const { taskSeries, tasks } = schema;

export type TaskSeries = typeof taskSeries.$inferSelect;

/** 놓친 회차는 최대 이만큼만 거슬러 만든다 (워커가 오래 멈췄을 때 폭주 방지) */
export const CATCH_UP_DAYS = 7;

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식');
const ruleSchema: z.ZodType<RecurrenceRule> = z.discriminatedUnion('freq', [
  z.object({ freq: z.literal('daily') }),
  z.object({
    freq: z.literal('weekly'),
    byWeekday: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  }),
  z.object({ freq: z.literal('monthly'), byMonthDay: z.number().int().min(1).max(31) }),
]);

const createInput = z.object({
  workspaceId: z.uuid(),
  title: z.string().trim().min(1, '제목을 입력하세요').max(300),
  description: z.string().max(10_000).nullable().optional(),
  projectId: z.uuid().nullable().optional(),
  priority: z.enum(tasks.priority.enumValues).optional(),
  tags: tagNamesSchema.optional(),
  rule: ruleSchema,
  timezone: z.string().min(1),
  startDate: dateString,
  endDate: dateString.nullable().optional(),
});

/**
 * 반복 할 일 시리즈를 만들고, 오늘까지의 회차를 바로 생성한다.
 * 이후 회차는 자동화 A03(반복 할 일)이 만든다.
 */
export async function createRecurringTask(
  db: Executor,
  actor: Actor,
  input: z.input<typeof createInput>,
  today: string,
) {
  const data = parse(createInput, input);
  const series = await db.transaction(async (tx) => {
    await requireAccess(tx, actor, data.workspaceId, 'write');
    if (data.projectId) await assertProjectInWorkspace(tx, data.projectId, data.workspaceId);
    const first = occursOn(data.rule, data.startDate)
      ? data.startDate
      : nextOccurrenceAfter(data.rule, data.startDate);
    const [s] = await tx
      .insert(taskSeries)
      .values({
        ...data,
        priority: data.priority ?? 'none',
        tags: data.tags ?? [],
        rule: data.rule as unknown as Record<string, unknown>,
        nextOccurrence: first,
        createdBy: actor.userId,
      })
      .returning();
    await recordAudit(tx, actor, {
      workspaceId: data.workspaceId,
      action: 'task_series.create',
      entityType: 'task_series',
      entityId: s!.id,
    });
    return s!;
  });
  const created = await generateSeriesOccurrences(db, series.id, today);
  return { series, created };
}

/**
 * 시리즈의 회차를 today(포함)까지 만든다. 몇 번을 동시에 호출해도
 * UNIQUE(series_id, occurrence_date) 때문에 같은 회차는 한 번만 생긴다 (인수 테스트 #3).
 * 반환값: 새로 만든 할 일 id
 */
export async function generateSeriesOccurrences(
  db: Executor,
  seriesId: string,
  today: string,
): Promise<string[]> {
  return db.transaction(async (tx) => {
    // 같은 시리즈를 동시에 처리하지 않도록 행 잠금
    const [s] = await tx.select().from(taskSeries).where(eq(taskSeries.id, seriesId)).for('update');
    if (!s || !s.active || !s.nextOccurrence || s.nextOccurrence > today) return [];
    const rule = s.rule as unknown as RecurrenceRule;
    const end = s.endDate && s.endDate < today ? s.endDate : today;
    const from =
      s.nextOccurrence < addDaysToDate(today, -CATCH_UP_DAYS + 1)
        ? addDaysToDate(today, -CATCH_UP_DAYS + 1)
        : s.nextOccurrence;
    const dates = occurrencesBetween(rule, from, end);

    const createdIds: string[] = [];
    for (const date of dates) {
      const [row] = await tx
        .insert(tasks)
        .values({
          workspaceId: s.workspaceId,
          projectId: s.projectId,
          title: s.title,
          description: s.description,
          priority: s.priority as (typeof tasks.priority.enumValues)[number],
          scheduledStart: localDateToUtc(date, s.timezone),
          allDay: true,
          seriesId: s.id,
          occurrenceDate: date,
          createdBy: s.createdBy,
        })
        .onConflictDoNothing({
          target: [tasks.seriesId, tasks.occurrenceDate],
          where: isNotNull(tasks.seriesId),
        })
        .returning({ id: tasks.id });
      if (row) {
        createdIds.push(row.id);
        if (s.tags.length) await replaceEntityTags(tx, s.workspaceId, 'task', row.id, s.tags);
      }
    }

    // 종료일이 지난 경우 등 만들 회차가 없으면 기준점을 앞으로 당기지 않는다
    const next = nextOccurrenceAfter(rule, end >= from ? end : addDaysToDate(from, -1));
    await tx
      .update(taskSeries)
      .set({
        nextOccurrence: s.endDate && next > s.endDate ? null : next,
        active: !(s.endDate && next > s.endDate),
      })
      .where(eq(taskSeries.id, s.id));
    return createdIds;
  });
}

/** 공간의 모든 활성 시리즈에서 today까지 회차 생성 (A03 실행 본체) */
export async function generateDueOccurrences(db: Executor, workspaceId: string, today: string) {
  const due = await db
    .select({ id: taskSeries.id })
    .from(taskSeries)
    .where(
      and(
        eq(taskSeries.workspaceId, workspaceId),
        eq(taskSeries.active, true),
        lte(taskSeries.nextOccurrence, today),
      ),
    );
  let created = 0;
  for (const s of due) created += (await generateSeriesOccurrences(db, s.id, today)).length;
  return { series: due.length, created };
}

export async function getSeries(db: Executor, actor: Actor, seriesId: string) {
  if (!isUuid(seriesId)) throw new NotFoundError('반복 설정');
  const [s] = await db.select().from(taskSeries).where(eq(taskSeries.id, seriesId));
  if (!s) throw new NotFoundError('반복 설정');
  await requireAccess(db, actor, s.workspaceId, 'read');
  return s;
}

/** 반복 중지. 이미 만든 회차는 그대로 둔다. */
export async function stopSeries(db: Executor, actor: Actor, seriesId: string) {
  const s = await getSeries(db, actor, seriesId);
  await requireAccess(db, actor, s.workspaceId, 'write');
  await db
    .update(taskSeries)
    .set({ active: false, nextOccurrence: null })
    .where(eq(taskSeries.id, seriesId));
}
