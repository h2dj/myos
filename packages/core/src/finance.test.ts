import { describe, expect, it } from 'vitest';
import { financeBudgetProgress, formatWon, shiftFinanceMonth } from './finance';

describe('재정 표시와 예산', () => {
  it('안전한 정수 범위를 넘는 원화와 부채를 정확히 표시한다', () => {
    expect(formatWon('9999999999999990')).toBe('9,999,999,999,999,990원');
    expect(formatWon('-25000')).toBe('-25,000원');
    expect(formatWon('0')).toBe('0원');
  });
  it('0원 예산과 초과 지출에서도 진행률과 남은 금액을 계산한다', () => {
    expect(financeBudgetProgress('0', '0')).toEqual({
      remaining: '0',
      exceeded: false,
      percent: 0,
    });
    expect(financeBudgetProgress('0', '500')).toEqual({
      remaining: '-500',
      exceeded: true,
      percent: 100,
    });
    expect(financeBudgetProgress('2000', '500')).toEqual({
      remaining: '1500',
      exceeded: false,
      percent: 25,
    });
    expect(financeBudgetProgress('100', '300')).toEqual({
      remaining: '-200',
      exceeded: true,
      percent: 100,
    });
  });
  it('월 탐색은 연말과 윤년을 넘는다', () => {
    expect(shiftFinanceMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftFinanceMonth('2024-03', -1)).toBe('2024-02');
  });
});
