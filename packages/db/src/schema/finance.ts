import {
  date,
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
