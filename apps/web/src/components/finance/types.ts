import type { getFinanceOverview } from '@myos/domain';
export type FinanceOverview = Awaited<ReturnType<typeof getFinanceOverview>>;
export type FinanceAccount = FinanceOverview['accounts'][number];
export type FinanceEntry = FinanceOverview['entries'][number];
export type FinanceBudget = FinanceOverview['budgets'][number];
