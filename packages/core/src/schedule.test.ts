import { describe, expect, it } from 'vitest';
import { describeSchedule, nextRunAfter } from './schedule';

const TZ = 'Asia/Seoul';
const iso = (d: Date) => d.toISOString();

describe('nextRunAfter', () => {
  // 2026-04-22(수) 10:00 KST
  const now = new Date('2026-04-22T01:00:00Z');

  it('매일: 오늘 시각이 지났으면 내일', () => {
    expect(iso(nextRunAfter({ kind: 'daily', time: '08:00' }, now, TZ))).toBe(
      '2026-04-22T23:00:00.000Z',
    );
    expect(iso(nextRunAfter({ kind: 'daily', time: '18:30' }, now, TZ))).toBe(
      '2026-04-22T09:30:00.000Z',
    );
  });

  it('정확히 그 시각이면 다음 회차', () => {
    const at = new Date('2026-04-22T09:30:00Z');
    expect(iso(nextRunAfter({ kind: 'daily', time: '18:30' }, at, TZ))).toBe(
      '2026-04-23T09:30:00.000Z',
    );
  });

  it('평일만: 금요일 다음은 월요일', () => {
    const fri = new Date('2026-04-24T01:00:00Z'); // 금 10:00 KST
    const next = nextRunAfter({ kind: 'daily', time: '08:00', weekdays: [1, 2, 3, 4, 5] }, fri, TZ);
    expect(iso(next)).toBe('2026-04-26T23:00:00.000Z'); // 월 08:00 KST
  });

  it('매주 금요일 18:00', () => {
    expect(iso(nextRunAfter({ kind: 'weekly', weekday: 5, time: '18:00' }, now, TZ))).toBe(
      '2026-04-24T09:00:00.000Z',
    );
  });

  it('주기 실행은 분 단위 경계에 맞춘다', () => {
    expect(
      iso(nextRunAfter({ kind: 'interval', minutes: 5 }, new Date('2026-04-22T01:02:10Z'), TZ)),
    ).toBe('2026-04-22T01:05:00.000Z');
  });

  it('설명', () => {
    expect(describeSchedule({ kind: 'daily', time: '08:00', weekdays: [1, 2, 3, 4, 5] })).toBe(
      '평일 08:00',
    );
    expect(describeSchedule({ kind: 'weekly', weekday: 5, time: '18:00' })).toBe(
      '매주 금요일 18:00',
    );
  });
});
