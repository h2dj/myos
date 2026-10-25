import { sql } from 'drizzle-orm';
import {
  date,
  check,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, timestamps, softDelete } from './_common';
import { users, workspaces } from './identity';

export const financeAccountKind = pgEnum('finance_account_kind', ['bank', 'cash', 'credit']);
export const financeEntryKind = pgEnum('finance_entry_kind', ['income', 'expense', 'transfer']);
const owner = () => ({
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
});
export const financeAccounts = pgTable(
  'finance_accounts',
  {
    id: id(),
    ...owner(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    kind: financeAccountKind('kind').notNull(),
    openingBalance: numeric('opening_balance', { precision: 18, scale: 0 }).notNull().default('0'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('finance_accounts_owner_idx').on(t.userId, t.workspaceId)],
);
export const financeEntries = pgTable(
  'finance_entries',
  {
    id: id(),
    ...owner(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => financeAccounts.id, { onDelete: 'restrict' }),
    targetAccountId: uuid('target_account_id').references(() => financeAccounts.id, {
      onDelete: 'restrict',
    }),
    kind: financeEntryKind('kind').notNull(),
    amount: numeric('amount', { precision: 18, scale: 0 }).notNull(),
    occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
    category: text('category').notNull(),
    note: text('note').notNull().default(''),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index('finance_entries_owner_date_idx').on(t.userId, t.workspaceId, t.occurredOn),
    index('finance_entries_account_idx').on(t.accountId),
    index('finance_entries_target_idx').on(t.targetAccountId),
  ],
);
export const financeBudgets = pgTable(
  'finance_budgets',
  {
    id: id(),
    ...owner(),
    month: date('month', { mode: 'string' }).notNull(),
    category: text('category').notNull(),
    description: text('description').notNull().default(''),
    amount: numeric('amount', { precision: 18, scale: 0 }).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('finance_budgets_month_category_uq').on(
      t.userId,
      t.workspaceId,
      t.month,
      t.category,
    ),
  ],
);

export const financeComments = pgTable(
  'finance_comments',
  {
    id: id(),
    ...owner(),
    accountId: uuid('account_id').references(() => financeAccounts.id, { onDelete: 'cascade' }),
    budgetId: uuid('budget_id').references(() => financeBudgets.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    ...timestamps,
  },
  (t) => [
    index('finance_comments_account_idx').on(t.userId, t.accountId, t.createdAt),
    index('finance_comments_budget_idx').on(t.userId, t.budgetId, t.createdAt),
    check(
      'finance_comments_one_target',
      sql`(${t.accountId} is not null and ${t.budgetId} is null) or (${t.accountId} is null and ${t.budgetId} is not null)`,
    ),
  ],
);

export const financePlanFrequency = pgEnum('finance_plan_frequency', [
  'once',
  'monthly',
  'quarterly',
  'yearly',
]);
export const financePlans = pgTable(
  'finance_plans',
  {
    id: id(),
    ...owner(),
    title: text('title').notNull(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => financeAccounts.id, { onDelete: 'restrict' }),
    targetAccountId: uuid('target_account_id').references(() => financeAccounts.id, {
      onDelete: 'restrict',
    }),
    kind: financeEntryKind('kind').notNull(),
    amount: numeric('amount', { precision: 18, scale: 0 }).notNull(),
    frequency: financePlanFrequency('frequency').notNull(),
    startOn: date('start_on', { mode: 'string' }).notNull(),
    endOn: date('end_on', { mode: 'string' }),
    category: text('category').notNull(),
    note: text('note').notNull().default(''),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('finance_plans_owner_idx').on(t.userId, t.workspaceId),
    check('finance_plans_amount_positive', sql`${t.amount} > 0`),
    check('finance_plans_valid_range', sql`${t.endOn} is null or ${t.endOn} >= ${t.startOn}`),
    check(
      'finance_plans_valid_transfer',
      sql`(${t.kind} = 'transfer' and ${t.targetAccountId} is not null and ${t.accountId} <> ${t.targetAccountId}) or (${t.kind} <> 'transfer' and ${t.targetAccountId} is null)`,
    ),
  ],
);
export const financePlanOutcomes = pgTable(
  'finance_plan_outcomes',
  {
    id: id(),
    ...owner(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => financePlans.id, { onDelete: 'cascade' }),
    occurrenceOn: date('occurrence_on', { mode: 'string' }).notNull(),
    status: text('status').$type<'posted' | 'skipped'>().notNull(),
    entryId: uuid('entry_id').references(() => financeEntries.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('finance_plan_outcomes_occurrence_uq').on(t.planId, t.occurrenceOn),
    uniqueIndex('finance_plan_outcomes_entry_uq').on(t.entryId),
    index('finance_plan_outcomes_owner_idx').on(t.userId, t.workspaceId, t.occurrenceOn),
    check(
      'finance_plan_outcomes_status',
      sql`${t.status} in ('posted', 'skipped') and (${t.status} = 'skipped' or ${t.entryId} is not null)`,
    ),
  ],
);
