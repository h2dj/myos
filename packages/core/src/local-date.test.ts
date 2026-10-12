import { describe, expect, it } from 'vitest';
import { formatLocalDay, localDateToUtc, utcToLocalDate } from './local-date';

describe('local date', () => {
  it('사용자 시간대의 자정으로 변환한다', () => {
    expect(localDateToUtc('2026-04-24', 'Asia/Seoul').toISOString()).toBe(
      '2026-04-23T15:00:00.000Z',
    );
    expect(localDateToUtc('2026-04-24', 'UTC').toISOString()).toBe('2026-04-24T00:00:00.000Z');
  });
  it('왕복 변환이 같은 날짜를 돌려준다', () => {
    const d = localDateToUtc('2026-12-31', 'America/New_York');
    expect(utcToLocalDate(d, 'America/New_York')).toBe('2026-12-31');
  });
  it('형식 오류는 거부', () => {
    expect(() => localDateToUtc('2026/04/24', 'UTC')).toThrow();
  });
  it('표시 형식', () => {
    expect(formatLocalDay(new Date('2026-04-23T15:00:00Z'), 'Asia/Seoul')).toBe('4월 24일 (금)');
  });
});
