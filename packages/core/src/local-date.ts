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

/** UTC 시각 → 사용자 시간대의 'HH:MM'(24시간제) */
export function utcToLocalTime(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('hour')}:${get('minute')}`;
}

/**
 * 시간 없이 날짜만 지정한 마감은 그 날 끝(23:59:59.999)으로 저장한다.
 * 사용자가 고른 시각은 분 단위라 초·밀리초가 0이므로, 59.999초로 끝나면 '시간 없음'으로 본다.
 */
export function hasDueTime(dueAt: Date | null): boolean {
  if (!dueAt) return false;
  return new Date(dueAt).getTime() % 60_000 !== 59_999;
}

/**
 * 할 일 기준 날짜에 붙여 보여줄 시각. 예정일이 있으면 예정 시각(종일이 아닐 때),
 * 예정일 없이 마감만 있으면 마감 시각(시간을 지정했을 때). 없으면 null.
 */
export function taskTimeLabel(
  task: { scheduledStart: Date | null; allDay: boolean; dueAt: Date | null },
  timeZone: string,
): string | null {
  if (task.scheduledStart) {
    return task.allDay ? null : utcToLocalTime(new Date(task.scheduledStart), timeZone);
  }
  return task.dueAt && hasDueTime(task.dueAt)
    ? utcToLocalTime(new Date(task.dueAt), timeZone)
    : null;
}
