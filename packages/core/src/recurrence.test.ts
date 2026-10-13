import { describe, expect, it } from 'vitest';
import {
  describeRecurrence,
  nextOccurrenceAfter,
  occurrencesBetween,
  occursOn,
} from './recurrence';

describe('recurrence', () => {
  it('평일 규칙', () => {
    const rule = { freq: 'weekly', byWeekday: [1, 2, 3, 4, 5] } as const;
    expect(occurrencesBetween(rule, '2026-04-23', '2026-04-28')).toEqual([
      '2026-04-23',
      '2026-04-24',
      '2026-04-27',
      '2026-04-28',
    ]);
    expect(nextOccurrenceAfter(rule, '2026-04-24')).toBe('2026-04-27');
    expect(describeRecurrence(rule)).toBe('평일마다');
  });

  it('매월 31일은 짧은 달에 말일로', () => {
    const rule = { freq: 'monthly', byMonthDay: 31 } as const;
    expect(occursOn(rule, '2026-02-28')).toBe(true);
    expect(occursOn(rule, '2026-04-30')).toBe(true);
    expect(occursOn(rule, '2026-05-30')).toBe(false);
    expect(nextOccurrenceAfter(rule, '2026-01-31')).toBe('2026-02-28');
  });

  it('매일', () => {
    expect(occurrencesBetween({ freq: 'daily' }, '2026-12-30', '2027-01-01')).toHaveLength(3);
  });
});
