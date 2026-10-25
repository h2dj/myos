import { randomUUID } from 'node:crypto';
import {
  addFinanceMonths,
  financeForecastUntil,
  financePlanOccurrences,
  summarizeFinanceForecast,
  utcToLocalDate,
  type ForecastCashFlow,
} from '@myos/core';
import { schema, type Db } from '@myos/db';
import { and, asc, count, desc, eq, gte, isNull, lte } from 'drizzle-orm';
import { z } from 'zod';
import { personalFinance } from './finance-access';
import { getFinanceBalances, saveFinanceEntry } from './finance';
import { recordAudit } from './audit';
import type { Actor, Executor } from './context';
import { NotFoundError, ValidationError } from './errors';
import { isUuid, parse } from './validation';
const {
  financePlans: plans,
  financePlanOutcomes: outcomes,
  financeEntries: entries,
  financeAccounts: accounts,
} = schema;
const day = z.iso
  .date()
  .refine(
    (value) => value >= '1900-01-01' && value <= '2099-12-31',
    '날짜는 1900~2099년으로 지정하세요.',
  );
const money = z
  .string()
  .trim()
  .regex(/^[1-9]\d{0,14}$/, '0원보다 큰 원 단위 정수를 입력하세요 (최대 15자리).');
const planInput = z
  .object({
    title: z.string().trim().min(1).max(200),
    accountId: z.uuid(),
    targetAccountId: z.uuid().nullable(),
    kind: z.enum(plans.kind.enumValues),
    amount: money,
    frequency: z.enum(plans.frequency.enumValues),
    startOn: day,
    endOn: day.nullable(),
    category: z.string().trim().max(50),
    note: z.string().trim().max(1000),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.endOn && v.endOn < v.startOn)
      ctx.addIssue({ code: 'custom', message: '종료일이 시작일보다 빠릅니다.' });
    if (
      v.kind === 'transfer'
        ? !v.targetAccountId || v.accountId === v.targetAccountId
        : v.targetAccountId !== null
    )
      ctx.addIssue({ code: 'custom', message: '이체는 서로 다른 두 계좌를 지정하세요.' });
  });
const scope = (table: typeof plans | typeof outcomes, actor: Actor, workspaceId: string) =>
  and(eq(table.userId, actor.userId), eq(table.workspaceId, workspaceId));
async function todayFor(db: Executor, actor: Actor, now = new Date()) {
  const [user] = await db
    .select({ timezone: schema.users.timezone })
    .from(schema.users)
    .where(eq(schema.users.id, actor.userId));
  if (!user) throw new NotFoundError('사용자');
  return utcToLocalDate(now, user.timezone);
}
async function loadPlan(db: Executor, actor: Actor, workspaceId: string, id: string) {
  if (!isUuid(id)) throw new NotFoundError('예정');
  const [row] = await db
    .select()
    .from(plans)
    .where(and(scope(plans, actor, workspaceId), eq(plans.id, id)));
  if (!row) throw new NotFoundError('예정');
  return row;
}
const audit = (db: Executor, actor: Actor, workspaceId: string, action: string, id: string) =>
  recordAudit(db, actor, { workspaceId, action, entityType: 'financePlan', entityId: id });

export async function saveFinancePlan(
  db: Db,
  actor: Actor,
  raw: unknown,
  id: string,
  editing = false,
) {
  const input = parse(planInput, raw);
  if (!isUuid(id)) throw new NotFoundError('예정');
  return db.transaction(async (tx) => {
    const workspaceId = await personalFinance(tx, actor, true);
    const [existing] = await tx
      .select()
      .from(plans)
      .where(and(scope(plans, actor, workspaceId), eq(plans.id, id)));
    if (!editing && existing) return existing;
    if (editing && !existing) throw new NotFoundError('예정');
    if (
      existing &&
      (existing.startOn !== input.startOn || existing.frequency !== input.frequency)
    ) {
      const [processed] = await tx
        .select({ id: outcomes.id })
        .from(outcomes)
        .where(and(scope(outcomes, actor, workspaceId), eq(outcomes.planId, id)))
        .limit(1);
      if (processed)
        throw new ValidationError(
          '확정·제외 이력이 있는 예정은 최초 예정일과 주기를 변경할 수 없습니다. 기존 규칙을 중지하고 새로 등록하세요.',
        );
    }
    const ownAccounts = await tx
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, actor.userId), eq(accounts.workspaceId, workspaceId)));
    for (const accountId of [input.accountId, input.targetAccountId].filter(
      (v): v is string => !!v,
    )) {
      const account = ownAccounts.find((a) => a.id === accountId);
      const retained =
        existing && (existing.accountId === accountId || existing.targetAccountId === accountId);
      if (!account || (account.archivedAt && !retained))
        throw new ValidationError('개인 공간의 사용 중인 계좌만 지정할 수 있습니다.');
    }
    if (!existing) {
      const [total] = await tx
        .select({ count: count() })
        .from(plans)
        .where(and(scope(plans, actor, workspaceId), isNull(plans.pausedAt)));
      if (total!.count >= 1000)
        throw new ValidationError(
          '사용 중인 예정은 최대 1,000개입니다. 사용하지 않는 규칙을 중지하세요.',
        );
    }
    const values = {
      ...input,
      category: input.kind === 'transfer' ? '이체' : input.category || '미분류',
    };
    const [saved] = existing
      ? await tx.update(plans).set(values).where(eq(plans.id, id)).returning()
      : await tx
          .insert(plans)
          .values({ ...values, id, userId: actor.userId, workspaceId })
          .returning();
    await audit(
      tx,
      actor,
      workspaceId,
      existing ? 'finance.plan.update' : 'finance.plan.create',
      id,
    );
    return saved!;
  });
}
export async function pauseFinancePlan(db: Db, actor: Actor, id: string, paused: boolean) {
  parse(z.boolean(), paused);
  return db.transaction(async (tx) => {
    const workspaceId = await personalFinance(tx, actor, true);
    const current = await loadPlan(tx, actor, workspaceId, id);
    if (!paused && current.pausedAt) {
      const [total] = await tx
        .select({ count: count() })
        .from(plans)
        .where(and(scope(plans, actor, workspaceId), isNull(plans.pausedAt)));
      if (total!.count >= 1000) throw new ValidationError('사용 중인 예정은 최대 1,000개입니다.');
    }
    await tx
      .update(plans)
      .set({ pausedAt: paused ? new Date() : null })
      .where(eq(plans.id, id));
    await audit(tx, actor, workspaceId, paused ? 'finance.plan.pause' : 'finance.plan.resume', id);
  });
}
export async function listFinancePlans(db: Db, actor: Actor, page = 1) {
  parse(z.number().int().min(1).max(100000), page);
  return db.transaction(
    async (tx) => {
      const workspaceId = await personalFinance(tx, actor);
      const today = await todayFor(tx, actor);
      const [total] = await tx
        .select({ count: count() })
        .from(plans)
        .where(scope(plans, actor, workspaceId));
      const pages = Math.max(1, Math.ceil(total!.count / 30));
      const selectedPage = Math.min(page, pages);
      const rows = await tx
        .select()
        .from(plans)
        .where(scope(plans, actor, workspaceId))
        .orderBy(desc(plans.createdAt), asc(plans.id))
        .limit(30)
        .offset((selectedPage - 1) * 30);
      const counts = await tx
        .select({ planId: outcomes.planId, count: count() })
        .from(outcomes)
        .where(scope(outcomes, actor, workspaceId))
        .groupBy(outcomes.planId);
      return {
        today,
        page: selectedPage,
        pages,
        total: total!.count,
        plans: rows.map((plan) => ({
          ...plan,
          processedCount: counts.find((row) => row.planId === plan.id)?.count ?? 0,
          nextOn:
            financePlanOccurrences(
              plan,
              today,
              addFinanceMonths(plan.startOn > today ? plan.startOn : today, 12),
            )[0] ?? null,
        })),
      };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}
export async function getFinanceForecast(db: Db, actor: Actor, raw: unknown, now = new Date()) {
  const input = parse(
    z
      .object({
        period: z.enum(['week', 'month', 'monthEnd', 'quarterEnd', 'yearEnd', 'custom']),
        until: day.optional(),
        page: z.number().int().min(1).max(100000).default(1),
      })
      .strict(),
    raw,
  );
  return db.transaction(
    async (tx) => {
      const workspaceId = await personalFinance(tx, actor);
      const today = await todayFor(tx, actor, now);
      if (input.period === 'custom' && !input.until)
        throw new ValidationError('기준 날짜를 입력하세요.');
      const until = financeForecastUntil(today, input.period, input.until);
      if (until < today || until > addFinanceMonths(today, 120) || until > '2099-12-31')
        throw new ValidationError('기준 날짜는 오늘부터 10년 이내로 지정하세요 (2099년까지).');
      const balances = await getFinanceBalances(tx, actor, workspaceId);
      const active = await tx
        .select()
        .from(plans)
        .where(and(scope(plans, actor, workspaceId), isNull(plans.pausedAt)))
        .limit(1001);
      if (active.length > 1000)
        throw new ValidationError(
          '사용 중인 예정이 1,000개를 초과했습니다. 일부 규칙을 중지하세요.',
        );
      const processed = await tx
        .select({
          planId: outcomes.planId,
          occurrenceOn: outcomes.occurrenceOn,
          status: outcomes.status,
          entryId: outcomes.entryId,
          entry: entries,
        })
        .from(outcomes)
        .leftJoin(
          entries,
          and(
            eq(entries.id, outcomes.entryId),
            eq(entries.userId, actor.userId),
            eq(entries.workspaceId, workspaceId),
          ),
        )
        .where(
          and(
            scope(outcomes, actor, workspaceId),
            gte(outcomes.occurrenceOn, today),
            lte(outcomes.occurrenceOn, until),
          ),
        );
      const outcomeMap = new Map(
        processed.map((row) => [`${row.planId}:${row.occurrenceOn}`, row]),
      );
      const flows: ForecastCashFlow[] = [];
      for (const plan of active)
        for (const dueOn of financePlanOccurrences(plan, today, until)) {
          if (flows.length >= 10000)
            throw new ValidationError(
              '계산할 예정 회차가 10,000건을 초과합니다. 기간을 줄여 주세요.',
            );
          const outcome = outcomeMap.get(`${plan.id}:${dueOn}`);
          const actual = outcome?.entry;
          const restoring = !!actual?.deletedAt;
          const status =
            outcome?.status === 'skipped'
              ? 'skipped'
              : actual && !actual.deletedAt
                ? 'posted'
                : 'pending';
          const values = actual ?? plan;
          flows.push({
            id: `${plan.id}:${dueOn}`,
            planId: plan.id,
            title: plan.title,
            dueOn,
            kind: values.kind,
            amount: values.amount,
            accountId: values.accountId,
            targetAccountId: values.targetAccountId,
            status,
            restoring,
            entryId: actual?.id ?? null,
            actualOn: actual?.occurredOn ?? null,
          });
        }
      flows.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.id.localeCompare(b.id));
      const summary = summarizeFinanceForecast(balances, flows, today);
      const pages = Math.max(1, Math.ceil(flows.length / 50));
      const page = Math.min(input.page, pages);
      return {
        today,
        until,
        period: input.period,
        maxUntil:
          addFinanceMonths(today, 120) < '2099-12-31' ? addFinanceMonths(today, 120) : '2099-12-31',
        summary,
        pendingCount: flows.filter((row) => row.status === 'pending').length,
        total: flows.length,
        page,
        pages,
        flows: flows.slice((page - 1) * 50, page * 50),
        accounts: balances,
      };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}
async function occurrence(
  db: Executor,
  actor: Actor,
  workspaceId: string,
  planId: string,
  on: string,
) {
  const plan = await loadPlan(db, actor, workspaceId, planId);
  parse(day, on);
  if (!financePlanOccurrences(plan, on, on).length)
    throw new ValidationError('해당 규칙의 예정 회차 날짜가 아닙니다.');
  return plan;
}
export async function postFinancePlan(
  db: Db,
  actor: Actor,
  planId: string,
  on: string,
  raw: unknown,
) {
  const input = parse(z.object({ amount: money, occurredOn: day }).strict(), raw);
  return db.transaction(async (tx) => {
    const workspaceId = await personalFinance(tx, actor, true);
    const plan = await occurrence(tx, actor, workspaceId, planId, on);
    if (plan.pausedAt) throw new ValidationError('중지한 규칙을 먼저 다시 사용으로 변경하세요.');
    const [outcome] = await tx
      .select()
      .from(outcomes)
      .where(
        and(
          scope(outcomes, actor, workspaceId),
          eq(outcomes.planId, planId),
          eq(outcomes.occurrenceOn, on),
        ),
      );
    if (outcome?.status === 'skipped')
      throw new ValidationError('제외한 회차를 먼저 제외 취소하세요.');
    if (outcome?.entryId) {
      const [entry] = await tx
        .select()
        .from(entries)
        .where(
          and(
            eq(entries.id, outcome.entryId),
            eq(entries.userId, actor.userId),
            eq(entries.workspaceId, workspaceId),
          ),
        );
      if (!entry) throw new NotFoundError('확정 거래');
      if (entry.deletedAt) {
        const [restored] = await tx
          .update(entries)
          .set({ deletedAt: null })
          .where(eq(entries.id, entry.id))
          .returning();
        await audit(tx, actor, workspaceId, 'finance.plan.restore', planId);
        return restored!;
      }
      return entry;
    }
    const entry = await saveFinanceEntry(
      tx,
      actor,
      {
        kind: plan.kind,
        accountId: plan.accountId,
        targetAccountId: plan.targetAccountId,
        amount: input.amount,
        occurredOn: input.occurredOn,
        category: plan.category,
        note: plan.note || plan.title,
      },
      randomUUID(),
    );
    await tx
      .insert(outcomes)
      .values({
        workspaceId,
        userId: actor.userId,
        planId,
        occurrenceOn: on,
        status: 'posted',
        entryId: entry.id,
      })
      .onConflictDoUpdate({
        target: [outcomes.planId, outcomes.occurrenceOn],
        set: { status: 'posted', entryId: entry.id, updatedAt: new Date() },
      });
    await audit(tx, actor, workspaceId, 'finance.plan.post', planId);
    return entry;
  });
}
export async function skipFinancePlan(
  db: Db,
  actor: Actor,
  planId: string,
  on: string,
  skipped: boolean,
) {
  parse(z.boolean(), skipped);
  return db.transaction(async (tx) => {
    const workspaceId = await personalFinance(tx, actor, true);
    await occurrence(tx, actor, workspaceId, planId, on);
    const [current] = await tx
      .select()
      .from(outcomes)
      .where(
        and(
          scope(outcomes, actor, workspaceId),
          eq(outcomes.planId, planId),
          eq(outcomes.occurrenceOn, on),
        ),
      );
    if (skipped) {
      if (current?.entryId) {
        const [entry] = await tx
          .select()
          .from(entries)
          .where(
            and(
              eq(entries.id, current.entryId),
              eq(entries.userId, actor.userId),
              isNull(entries.deletedAt),
            ),
          );
        if (entry)
          throw new ValidationError(
            '확정된 거래는 예측에서 이미 제외됩니다. 거래를 취소하려면 거래 내역에서 삭제하세요.',
          );
      }
      await tx
        .insert(outcomes)
        .values({ workspaceId, userId: actor.userId, planId, occurrenceOn: on, status: 'skipped' })
        .onConflictDoUpdate({
          target: [outcomes.planId, outcomes.occurrenceOn],
          set: { status: 'skipped', updatedAt: new Date() },
        });
    } else if (current) {
      if (current.entryId)
        await tx.update(outcomes).set({ status: 'posted' }).where(eq(outcomes.id, current.id));
      else await tx.delete(outcomes).where(eq(outcomes.id, current.id));
    }
    await audit(
      tx,
      actor,
      workspaceId,
      skipped ? 'finance.plan.skip' : 'finance.plan.unskip',
      planId,
    );
  });
}
