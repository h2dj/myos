import { describe, expect, it } from 'vitest';
import {
  financeForecastUntil,
  financePlanOccurrences,
  summarizeFinanceForecast,
  type ForecastCashFlow,
} from './finance-planning';
describe('재정 예정 계산', () => {
  it('월말 기준일을 유지하며 윤년과 분기·연 반복을 계산한다', () => {
    const plan = { frequency: 'monthly' as const, startOn: '2024-01-31', endOn: null };
    expect(financePlanOccurrences(plan, '2024-01-01', '2024-04-30')).toEqual([
      '2024-01-31',
      '2024-02-29',
      '2024-03-31',
      '2024-04-30',
    ]);
    expect(
      financePlanOccurrences({ ...plan, frequency: 'quarterly' }, '2024-02-01', '2024-10-30'),
    ).toEqual(['2024-04-30', '2024-07-31']);
    expect(
      financePlanOccurrences(
        { ...plan, frequency: 'yearly', startOn: '2024-02-29' },
        '2025-01-01',
        '2028-02-29',
      ),
    ).toEqual(['2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
    expect(
      financePlanOccurrences(
        { ...plan, startOn: '1900-01-31', endOn: '2026-02-28' },
        '2026-02-01',
        '2026-12-31',
      ),
    ).toEqual(['2026-02-28']);
  });
  it('주·월·월말·분기말·연말·직접 날짜를 계산한다', () => {
    expect(financeForecastUntil('2026-01-31', 'week')).toBe('2026-02-07');
    expect(financeForecastUntil('2026-01-31', 'month')).toBe('2026-02-28');
    expect(financeForecastUntil('2024-02-01', 'monthEnd')).toBe('2024-02-29');
    expect(financeForecastUntil('2026-10-25', 'quarterEnd')).toBe('2026-12-31');
    expect(financeForecastUntil('2026-03-31', 'quarterEnd')).toBe('2026-03-31');
    expect(financeForecastUntil('2026-10-25', 'yearEnd')).toBe('2026-12-31');
    expect(financeForecastUntil('2026-10-25', 'custom', '2027-01-01')).toBe('2027-01-01');
  });
  it('확정·제외 회차를 빼고 이체를 계좌에만 반영하며 큰 금액의 최저 잔액을 계산한다', () => {
    const base: ForecastCashFlow = {
      id: '1',
      planId: 'p',
      title: '예정',
      dueOn: '2026-01-02',
      kind: 'expense',
      amount: '100',
      accountId: 'a',
      targetAccountId: null,
      status: 'pending',
      entryId: null,
      actualOn: null,
      restoring: false,
    };
    const result = summarizeFinanceForecast(
      [
        { id: 'a', name: '은행', balance: '9007199254740993' },
        { id: 'b', name: '현금', balance: '0' },
      ],
      [
        base,
        { ...base, kind: 'transfer', amount: '200', targetAccountId: 'b' },
        { ...base, status: 'posted', amount: '999' },
        { ...base, status: 'skipped', amount: '999' },
        { ...base, kind: 'income', dueOn: '2026-01-03', amount: '500' },
      ],
      '2026-01-01',
    );
    expect(result).toMatchObject({
      income: '500',
      expense: '100',
      closing: '9007199254741393',
      minimum: '9007199254740893',
    });
    expect(result.accounts[1]?.projected).toBe('200');
    expect(
      summarizeFinanceForecast([{ id: 'a', name: '은행', balance: '50' }], [base], '2026-01-01')
        .negativeOn,
    ).toBe('2026-01-02');
  });
});
