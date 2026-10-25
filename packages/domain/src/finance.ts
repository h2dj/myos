import { financeBudgetProgress, shiftFinanceMonth, utcToLocalDate } from '@myos/core';
import { schema, type Db } from '@myos/db';
import { and, asc, count, desc, eq, gte, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Actor, Executor } from './context';
import { requireAccess } from './access';
import { NotFoundError, ValidationError } from './errors';
import { isUuid, parse } from './validation';
import { recordAudit } from './audit';

const {
  financeAccounts: accounts,
  financeEntries: entries,
  financeBudgets: budgets,
  workspaces,
  users,
} = schema;
const unsigned = z
  .string()
  .trim()
  .regex(/^(0|[1-9]\d{0,14})$/, '원 단위 정수를 입력하세요 (최대 15자리).');
const positive = unsigned.refine((value) => BigInt(value) > 0n, '금액은 0원보다 커야 합니다.');
const signed = z
  .string()
  .trim()
  .regex(/^-?(0|[1-9]\d{0,14})$/, '원 단위 정수를 입력하세요 (최대 15자리).')
  .transform((value) => BigInt(value).toString());
const monthSchema = z
  .string()
  .regex(/^(19|20)\d{2}-(0[1-9]|1[0-2])$/, '월을 YYYY-MM 형식으로 입력하세요.');
const accountInput = z
  .object({
    name: z.string().trim().min(1).max(100),
    kind: z.enum(accounts.kind.enumValues),
    openingBalance: signed,
  })
  .strict();
const entryInput = z
  .object({
    accountId: z.uuid(),
    targetAccountId: z.uuid().nullable(),
    kind: z.enum(entries.kind.enumValues),
    amount: positive,
    occurredOn: z.iso.date(),
    category: z.string().trim().max(50),
    note: z.string().trim().max(1000),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (
      input.kind === 'transfer'
        ? !input.targetAccountId || input.accountId === input.targetAccountId
        : input.targetAccountId !== null
    )
      ctx.addIssue({
        code: 'custom',
        message:
          '이체는 서로 다른 두 계좌가 필요하며, 수입·지출에는 도착 계좌를 지정할 수 없습니다.',
      });
    if (input.occurredOn < '1900-01-01' || input.occurredOn > '2099-12-31')
      ctx.addIssue({ code: 'custom', message: '거래일 범위가 올바르지 않습니다.' });
  });
const budgetInput = z
  .object({ month: monthSchema, category: z.string().trim().min(1).max(50), amount: unsigned })
  .strict();

async function personalFinance(db: Executor, actor: Actor, write = false) {
  if (write)
    await db.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${'finance:' + actor.userId}, 0))`,
    );
  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.ownerId, actor.userId),
        eq(workspaces.type, 'personal'),
        isNull(workspaces.deletedAt),
      ),
    );
  if (!workspace) throw new NotFoundError('개인 공간');
  await requireAccess(db, actor, workspace.id, 'manage');
  return workspace.id;
}
const owned = (
  table: typeof accounts | typeof entries | typeof budgets,
  actor: Actor,
  workspaceId: string,
) => and(eq(table.userId, actor.userId), eq(table.workspaceId, workspaceId));
const audit = (db: Executor, actor: Actor, workspaceId: string, action: string, id: string) =>
  recordAudit(db, actor, { workspaceId, action, entityType: 'finance', entityId: id });

export async function saveFinanceAccount(db: Db, actor: Actor, raw: unknown, id?: string) {
  const input = parse(accountInput, raw);
  if (id && !isUuid(id)) throw new NotFoundError('계좌');
  return db.transaction(async (tx) => {
    const workspaceId = await personalFinance(tx, actor, true);
    const [saved] = id
      ? await tx
          .update(accounts)
          .set(input)
          .where(and(owned(accounts, actor, workspaceId), eq(accounts.id, id)))
          .returning()
      : await tx
          .insert(accounts)
          .values({ ...input, workspaceId, userId: actor.userId })
          .returning();
    if (!saved) throw new NotFoundError('계좌');
    await audit(
      tx,
      actor,
      workspaceId,
      id ? 'finance.account.update' : 'finance.account.create',
      saved.id,
    );
    return saved;
  });
}
export async function archiveFinanceAccount(db: Db, actor: Actor, id: string, archived: boolean) {
  if (!isUuid(id)) throw new NotFoundError('계좌');
  return db.transaction(async (tx) => {
    const workspaceId = await personalFinance(tx, actor, true);
    const [saved] = await tx
      .update(accounts)
      .set({ archivedAt: archived ? new Date() : null })
      .where(and(owned(accounts, actor, workspaceId), eq(accounts.id, id)))
      .returning();
    if (!saved) throw new NotFoundError('계좌');
    await audit(tx, actor, workspaceId, 'finance.account.archive', id);
    return saved;
  });
}
export async function saveFinanceEntry(
  db: Db,
  actor: Actor,
  raw: unknown,
  id: string,
  editing = false,
) {
  const input = parse(entryInput, raw);
  if (!isUuid(id)) throw new NotFoundError('거래');
  return db.transaction(async (tx) => {
    const workspaceId = await personalFinance(tx, actor, true);
    const [current] = await tx
      .select()
      .from(entries)
      .where(and(owned(entries, actor, workspaceId), eq(entries.id, id)));
    if (!editing && current) return current;
    if (editing && (!current || current.deletedAt)) throw new NotFoundError('거래');
    const [user] = await tx
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, actor.userId));
    if (!user || input.occurredOn > utcToLocalDate(new Date(), user.timezone))
      throw new ValidationError('거래일은 오늘 이후일 수 없습니다.');
    const selectedAccounts = await tx
      .select()
      .from(accounts)
      .where(owned(accounts, actor, workspaceId));
    for (const accountId of [input.accountId, input.targetAccountId].filter(
      (value): value is string => !!value,
    )) {
      const account = selectedAccounts.find((a) => a.id === accountId);
      const existingConnection =
        editing && (current!.accountId === accountId || current!.targetAccountId === accountId);
      if (!account || (account.archivedAt && !existingConnection))
        throw new ValidationError('내 개인 공간의 사용 중인 계좌만 연결할 수 있습니다.');
    }
    const values = {
      ...input,
      category: input.kind === 'transfer' ? '이체' : input.category || '미분류',
    };
    const [saved] = editing
      ? await tx
          .update(entries)
          .set(values)
          .where(and(owned(entries, actor, workspaceId), eq(entries.id, id)))
          .returning()
      : await tx
          .insert(entries)
          .values({ ...values, id, workspaceId, userId: actor.userId })
          .returning();
    if (!saved) throw new NotFoundError('거래');
    await audit(
      tx,
      actor,
      workspaceId,
      editing ? 'finance.entry.update' : 'finance.entry.create',
      id,
    );
    return saved;
  });
}
export async function setFinanceEntryDeleted(db: Db, actor: Actor, id: string, deleted: boolean) {
  if (!isUuid(id)) throw new NotFoundError('거래');
  return db.transaction(async (tx) => {
    const workspaceId = await personalFinance(tx, actor, true);
    const [saved] = await tx
      .update(entries)
      .set({ deletedAt: deleted ? new Date() : null })
      .where(and(owned(entries, actor, workspaceId), eq(entries.id, id)))
      .returning();
    if (!saved) throw new NotFoundError('거래');
    await audit(
      tx,
      actor,
      workspaceId,
      deleted ? 'finance.entry.delete' : 'finance.entry.restore',
      id,
    );
    return saved;
  });
}
export async function saveFinanceBudget(db: Db, actor: Actor, raw: unknown) {
  const input = parse(budgetInput, raw);
  return db.transaction(async (tx) => {
    const workspaceId = await personalFinance(tx, actor, true);
    const [saved] = await tx
      .insert(budgets)
      .values({ ...input, month: `${input.month}-01`, workspaceId, userId: actor.userId })
      .onConflictDoUpdate({
        target: [budgets.userId, budgets.workspaceId, budgets.month, budgets.category],
        set: { amount: input.amount, updatedAt: new Date() },
      })
      .returning();
    await audit(tx, actor, workspaceId, 'finance.budget.save', saved!.id);
    return saved!;
  });
}
export async function deleteFinanceBudget(db: Db, actor: Actor, id: string) {
  if (!isUuid(id)) throw new NotFoundError('예산');
  return db.transaction(async (tx) => {
    const workspaceId = await personalFinance(tx, actor, true);
    const [deleted] = await tx
      .delete(budgets)
      .where(and(owned(budgets, actor, workspaceId), eq(budgets.id, id)))
      .returning({ id: budgets.id });
    if (!deleted) throw new NotFoundError('예산');
    await audit(tx, actor, workspaceId, 'finance.budget.delete', id);
  });
}

export async function getFinanceOverview(
  db: Db,
  actor: Actor,
  month: string,
  page = 1,
  trash = false,
) {
  parse(monthSchema, month);
  parse(z.number().int().min(1).max(100000), page);
  return db.transaction(
    async (tx) => {
      const workspaceId = await personalFinance(tx, actor);
      const allAccounts = await tx
        .select()
        .from(accounts)
        .where(owned(accounts, actor, workspaceId))
        .orderBy(asc(accounts.createdAt), asc(accounts.id));
      const movements = await tx.execute<{ accountId: string; net: string }>(sql`
      select account_id as "accountId", sum(delta)::text as net from (
        select account_id, case when kind = 'income' then amount else -amount end as delta
        from finance_entries where user_id = ${actor.userId} and workspace_id = ${workspaceId} and deleted_at is null
        union all
        select target_account_id, amount from finance_entries
        where user_id = ${actor.userId} and workspace_id = ${workspaceId} and kind = 'transfer' and deleted_at is null
      ) as movements group by account_id
    `);
      const netByAccount = new Map(movements.map((row) => [row.accountId, row.net]));
      const withBalances = allAccounts.map((account) => ({
        ...account,
        balance: (
          BigInt(account.openingBalance) + BigInt(netByAccount.get(account.id) ?? '0')
        ).toString(),
      }));
      const period = and(
        owned(entries, actor, workspaceId),
        gte(entries.occurredOn, `${month}-01`),
        lt(entries.occurredOn, `${shiftFinanceMonth(month, 1)}-01`),
      );
      const totals = await tx
        .select({ kind: entries.kind, amount: sql<string>`sum(${entries.amount})::text` })
        .from(entries)
        .where(and(period, isNull(entries.deletedAt)))
        .groupBy(entries.kind);
      const byCategory = await tx
        .select({ category: entries.category, amount: sql<string>`sum(${entries.amount})::text` })
        .from(entries)
        .where(and(period, isNull(entries.deletedAt), eq(entries.kind, 'expense')))
        .groupBy(entries.category)
        .orderBy(desc(sql`sum(${entries.amount})`), asc(entries.category));
      const monthBudgets = await tx
        .select()
        .from(budgets)
        .where(and(owned(budgets, actor, workspaceId), eq(budgets.month, `${month}-01`)))
        .orderBy(asc(budgets.category));
      const listWhere = and(
        period,
        trash ? isNotNull(entries.deletedAt) : isNull(entries.deletedAt),
      );
      const [total] = await tx.select({ count: count() }).from(entries).where(listWhere);
      const pages = Math.max(1, Math.ceil(total!.count / 50));
      const currentPage = Math.min(page, pages);
      const rows = await tx
        .select()
        .from(entries)
        .where(listWhere)
        .orderBy(desc(entries.occurredOn), desc(entries.createdAt), desc(entries.id))
        .limit(50)
        .offset((currentPage - 1) * 50);
      const income = totals.find((row) => row.kind === 'income')?.amount ?? '0';
      const expense = totals.find((row) => row.kind === 'expense')?.amount ?? '0';
      return {
        month,
        page: currentPage,
        pages,
        total: total!.count,
        trash,
        accounts: withBalances,
        entries: rows,
        income,
        expense,
        net: (BigInt(income) - BigInt(expense)).toString(),
        balance: withBalances
          .reduce((sum, account) => sum + BigInt(account.balance), 0n)
          .toString(),
        byCategory,
        budgets: monthBudgets.map((budget) => {
          const spent = byCategory.find((row) => row.category === budget.category)?.amount ?? '0';
          return { ...budget, spent, ...financeBudgetProgress(budget.amount, spent) };
        }),
      };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}
