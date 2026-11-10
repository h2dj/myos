import { describe, expect, it } from 'vitest';
import {
  formatLocalDay,
  hasDueTime,
  localDateToUtc,
  taskTimeLabel,
  utcToLocalDate,
  utcToLocalTime,
} from './local-date';

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

describe('할 일 시각', () => {
  it('사용자 시간대의 HH:MM', () => {
    expect(utcToLocalTime(new Date('2026-04-24T00:30:00Z'), 'Asia/Seoul')).toBe('09:30');
    expect(utcToLocalTime(new Date('2026-04-23T15:00:00Z'), 'Asia/Seoul')).toBe('00:00');
  });
  it('날짜만 지정한 마감(그 날 끝)은 시간 없음으로 본다', () => {
    const endOfDay = new Date(localDateToUtc('2026-04-25', 'Asia/Seoul').getTime() - 1);
    expect(hasDueTime(endOfDay)).toBe(false);
    expect(hasDueTime(new Date('2026-04-24T09:00:00Z'))).toBe(true);
    expect(hasDueTime(null)).toBe(false);
  });
  it('예정 시각 → 마감 시각 순으로 표시', () => {
    const start = new Date('2026-04-24T01:00:00Z');
    const due = new Date('2026-04-24T08:00:00Z');
    expect(taskTimeLabel({ scheduledStart: start, allDay: false, dueAt: due }, 'Asia/Seoul')).toBe(
      '10:00',
    );
    expect(taskTimeLabel({ scheduledStart: start, allDay: true, dueAt: due }, 'Asia/Seoul')).toBe(
      null,
    );
    expect(taskTimeLabel({ scheduledStart: null, allDay: true, dueAt: due }, 'Asia/Seoul')).toBe(
      '17:00',
    );
  });
});
