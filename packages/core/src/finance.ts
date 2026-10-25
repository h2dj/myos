export const FINANCE_ACCOUNT_LABELS = { bank: '은행', cash: '현금', credit: '신용카드' } as const;
export const FINANCE_KIND_LABELS = { income: '수입', expense: '지출', transfer: '이체' } as const;
export const FINANCE_CATEGORIES = [
  '식비',
  '교통',
  '주거',
  '건강',
  '쇼핑',
  '여가',
  '교육',
  '구독',
  '급여',
  '기타수입',
  '미분류',
];
export function formatWon(value: string) {
  return `${new Intl.NumberFormat('ko-KR').format(BigInt(value))}원`;
}
export function shiftFinanceMonth(month: string, offset: number) {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}
export function financeBudgetProgress(budget: string, spent: string) {
  const limit = BigInt(budget),
    used = BigInt(spent);
  return {
    remaining: (limit - used).toString(),
    exceeded: used > limit,
    percent:
      limit === 0n
        ? used > 0n
          ? 100
          : 0
        : Number((used * 100n) / limit > 100n ? 100n : (used * 100n) / limit),
  };
}
