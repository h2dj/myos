import { TZDate } from '@date-fns/tz';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 'YYYY-MM-DD'(사용자 시간대의 날짜) → 그 날 00:00의 UTC 시각 */
export function localDateToUtc(date: string, timeZone: string): Date {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`잘못된 날짜 형식: ${date}`);
  const [, y, mo, d] = m;
  return new Date(new TZDate(Number(y), Number(mo) - 1, Number(d), timeZone).getTime());
}

/** UTC 시각 → 사용자 시간대의 'YYYY-MM-DD' */
export function utcToLocalDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** 화면 표시용: '4월 24일 (금)' */
export function formatLocalDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone,
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(date);
}
