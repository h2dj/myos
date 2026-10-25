import { shiftCalendarDate } from './calendar';
export const FINANCE_FREQUENCIES = {
  once: '한 번',
  monthly: '매월',
  quarterly: '매분기 (3개월)',
  yearly: '매년',
} as const;
export type FinanceFrequency = keyof typeof FINANCE_FREQUENCIES;
export const FINANCE_FORECAST_PERIODS = {
  week: '앞으로 1주',
  month: '앞으로 1개월',
  monthEnd: '이번 달 말',
  quarterEnd: '이번 분기 말',
  yearEnd: '올해 말',
  custom: '기준 날짜 직접 입력',
} as const;
export type FinanceForecastPeriod = keyof typeof FINANCE_FORECAST_PERIODS;
export function addFinanceMonths(day: string, months: number) {
  const [year, month, date] = day.split('-').map(Number);
  const shifted = new Date(Date.UTC(year!, month! - 1 + months, 1, 12));
  const last = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0, 12),
  ).getUTCDate();
  shifted.setUTCDate(Math.min(date!, last));
  return shifted.toISOString().slice(0, 10);
}
export function financeForecastUntil(today: string, period: FinanceForecastPeriod, until?: string) {
  const [year, month] = today.split('-').map(Number);
  switch (period) {
    case 'week':
      return shiftCalendarDate(today, 7);
    case 'month':
      return addFinanceMonths(today, 1);
    case 'monthEnd':
      return shiftCalendarDate(addFinanceMonths(`${today.slice(0, 7)}-01`, 1), -1);
    case 'quarterEnd':
      return new Date(Date.UTC(year!, Math.ceil(month! / 3) * 3, 0, 12)).toISOString().slice(0, 10);
    case 'yearEnd':
      return `${year}-12-31`;
    case 'custom':
      if (!until) throw new Error('기준 날짜를 입력하세요.');
      return until;
  }
}
export function financePlanOccurrences(
  plan: { frequency: FinanceFrequency; startOn: string; endOn: string | null },
  from: string,
  until: string,
) {
  const end = plan.endOn && plan.endOn < until ? plan.endOn : until;
  if (from > end || plan.startOn > end) return [];
  if (plan.frequency === 'once')
    return plan.startOn >= from && plan.startOn <= end ? [plan.startOn] : [];
  const step = plan.frequency === 'monthly' ? 1 : plan.frequency === 'quarterly' ? 3 : 12;
  const months =
    (Number(from.slice(0, 4)) - Number(plan.startOn.slice(0, 4))) * 12 +
    Number(from.slice(5, 7)) -
    Number(plan.startOn.slice(5, 7));
  let index = Math.max(0, Math.floor(months / step));
  const days: string[] = [];
  for (;;) {
    const day = addFinanceMonths(plan.startOn, index * step);
    if (day > end) break;
    if (day >= from) days.push(day);
    index++;
  }
  return days;
}
export interface ForecastCashFlow {
  id: string;
  planId: string;
  title: string;
  dueOn: string;
  kind: 'income' | 'expense' | 'transfer';
  amount: string;
  accountId: string;
  targetAccountId: string | null;
  status: 'pending' | 'posted' | 'skipped';
  entryId: string | null;
  actualOn: string | null;
  restoring: boolean;
}
export function summarizeFinanceForecast(
  accounts: { id: string; name: string; balance: string }[],
  flows: ForecastCashFlow[],
  today: string,
) {
  const pending = flows.filter((flow) => flow.status === 'pending');
  const balances = new Map(accounts.map((a) => [a.id, BigInt(a.balance)]));
  const opening = accounts.reduce((sum, a) => sum + BigInt(a.balance), 0n);
  let income = 0n,
    expense = 0n;
  const days = new Map<string, { income: bigint; expense: bigint }>();
  for (const flow of pending) {
    const amount = BigInt(flow.amount);
    balances.set(
      flow.accountId,
      balances.get(flow.accountId)! + (flow.kind === 'income' ? amount : -amount),
    );
    if (flow.kind === 'transfer')
      balances.set(flow.targetAccountId!, balances.get(flow.targetAccountId!)! + amount);
    const day = days.get(flow.dueOn) ?? { income: 0n, expense: 0n };
    if (flow.kind === 'income') {
      income += amount;
      day.income += amount;
    }
    if (flow.kind === 'expense') {
      expense += amount;
      day.expense += amount;
    }
    days.set(flow.dueOn, day);
  }
  let running = opening,
    minimum = opening;
  let negativeOn: string | null = opening < 0n ? today : null;
  const timeline = [...days]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, sums]) => {
      running += sums.income - sums.expense;
      if (running < minimum) minimum = running;
      if (running < 0n && negativeOn === null) negativeOn = day;
      return {
        day,
        income: sums.income.toString(),
        expense: sums.expense.toString(),
        balance: running.toString(),
      };
    });
  return {
    opening: opening.toString(),
    income: income.toString(),
    expense: expense.toString(),
    net: (income - expense).toString(),
    closing: (opening + income - expense).toString(),
    minimum: minimum.toString(),
    negativeOn,
    timeline,
    accounts: accounts.map((a) => ({
      ...a,
      projected: balances.get(a.id)!.toString(),
      change: (balances.get(a.id)! - BigInt(a.balance)).toString(),
    })),
  };
}
