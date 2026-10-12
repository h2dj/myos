import { describe, expect, it } from 'vitest';
import { getPeriodRange } from './period';

const SEOUL = 'Asia/Seoul';

describe('getPeriodRange', () => {
  // 2026-04-24(금) 01:30 KST == 2026-04-23 16:30 UTC
  const now = new Date('2026-04-23T16:30:00Z');

  it('today는 사용자 시간대의 자정~자정이다', () => {
    const { start, end } = getPeriodRange('today', now, SEOUL);
    expect(start?.toISOString()).toBe('2026-04-23T15:00:00.000Z');
    expect(end?.toISOString()).toBe('2026-04-24T14:59:59.999Z');
  });

  it('week는 월요일에 시작한다', () => {
    const { start, end } = getPeriodRange('week', now, SEOUL);
    expect(start?.toISOString()).toBe('2026-04-19T15:00:00.000Z'); // 4/20(월) 00:00 KST
    expect(end?.toISOString()).toBe('2026-04-26T14:59:59.999Z'); // 4/26(일) 23:59 KST
  });

  it('all은 범위 제한이 없다', () => {
    expect(getPeriodRange('all', now, SEOUL)).toEqual({ start: null, end: null });
  });
});
