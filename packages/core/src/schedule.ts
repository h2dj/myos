import { TZDate } from '@date-fns/tz';
import { addDays } from 'date-fns';

/**
 * 자동화 실행 일정
 * - daily: 매일(또는 지정 요일만) HH:MM
 * - weekly: 매주 지정 요일 HH:MM
 * - interval: N분마다
 * 요일은 0=일요일 … 6=토요일
 */
export type AutomationSchedule =
  | { kind: 'daily'; time: string; weekdays?: number[] }
  | { kind: 'weekly'; weekday: number; time: string }
  | { kind: 'interval'; minutes: number };

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(time: string): boolean {
  return TIME_RE.test(time);
}

/** 사용자 시간대의 날짜 + 'HH:MM' → UTC 시각 */
export function localDateTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  return new Date(new TZDate(y, m - 1, d, hh, mm, timeZone).getTime());
}

/** after보다 엄격히 뒤인 다음 실행 시각 */
export function nextRunAfter(schedule: AutomationSchedule, after: Date, timeZone: string): Date {
  if (schedule.kind === 'interval') {
    const ms = Math.max(1, schedule.minutes) * 60_000;
    return new Date(Math.floor(after.getTime() / ms) * ms + ms);
  }
  if (!isValidTime(schedule.time)) throw new Error(`잘못된 시각: ${schedule.time}`);
  const allowed =
    schedule.kind === 'weekly'
      ? [schedule.weekday]
      : schedule.weekdays && schedule.weekdays.length > 0
        ? schedule.weekdays
        : [0, 1, 2, 3, 4, 5, 6];

  const start = new TZDate(after, timeZone);
  for (let i = 0; i <= 7; i++) {
    const day = addDays(start, i);
    if (!allowed.includes(day.getDay())) continue;
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    const at = localDateTimeToUtc(date, schedule.time, timeZone);
    if (at > after) return at;
  }
  throw new Error('다음 실행 시각을 찾지 못했습니다.');
}

const WEEKDAY_LABEL = ['일', '월', '화', '수', '목', '금', '토'];

export function describeSchedule(schedule: AutomationSchedule): string {
  switch (schedule.kind) {
    case 'interval':
      return `${schedule.minutes}분마다`;
    case 'weekly':
      return `매주 ${WEEKDAY_LABEL[schedule.weekday]}요일 ${schedule.time}`;
    case 'daily': {
      const days = schedule.weekdays ?? [];
      if (days.length === 0 || days.length === 7) return `매일 ${schedule.time}`;
      if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d)))
        return `평일 ${schedule.time}`;
      return `${days.map((d) => WEEKDAY_LABEL[d]).join('·')} ${schedule.time}`;
    }
  }
}
