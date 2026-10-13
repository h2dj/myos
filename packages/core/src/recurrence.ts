import { addDays, getDaysInMonth } from 'date-fns';

/**
 * 반복 할 일 규칙 (TASK-02)
 * - daily: 매일
 * - weekly: 지정 요일마다 (0=일 … 6=토). 평일 = [1,2,3,4,5]
 * - monthly: 매월 N일 (그 달에 없으면 말일)
 */
export type RecurrenceRule =
  | { freq: 'daily' }
  | { freq: 'weekly'; byWeekday: readonly number[] }
  | { freq: 'monthly'; byMonthDay: number };

/** 'YYYY-MM-DD' 날짜 연산은 시간대와 무관하게 UTC 정오 기준으로 한다 */
function parse(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}
function format(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function occursOn(rule: RecurrenceRule, date: string): boolean {
  const d = parse(date);
  switch (rule.freq) {
    case 'daily':
      return true;
    case 'weekly':
      return rule.byWeekday.includes(d.getUTCDay());
    case 'monthly': {
      const last = getDaysInMonth(d);
      return d.getUTCDate() === Math.min(rule.byMonthDay, last);
    }
  }
}

/** from(포함)부터 to(포함)까지 규칙에 맞는 날짜들 */
export function occurrencesBetween(rule: RecurrenceRule, from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = parse(from); format(d) <= to; d = addDays(d, 1)) {
    if (occursOn(rule, format(d))) out.push(format(d));
    if (out.length > 400) break;
  }
  return out;
}

/** after(제외) 이후 첫 회차 */
export function nextOccurrenceAfter(rule: RecurrenceRule, after: string): string {
  let d = addDays(parse(after), 1);
  for (let i = 0; i < 400; i++, d = addDays(d, 1)) {
    if (occursOn(rule, format(d))) return format(d);
  }
  throw new Error('다음 회차를 찾지 못했습니다.');
}

export function addDaysToDate(date: string, days: number): string {
  return format(addDays(parse(date), days));
}

export const RECURRENCE_PRESETS = {
  daily: { label: '매일', rule: { freq: 'daily' } },
  weekdays: { label: '평일마다', rule: { freq: 'weekly', byWeekday: [1, 2, 3, 4, 5] } },
} as const satisfies Record<string, { label: string; rule: RecurrenceRule }>;

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

export function describeRecurrence(rule: RecurrenceRule): string {
  switch (rule.freq) {
    case 'daily':
      return '매일';
    case 'weekly': {
      const days = [...rule.byWeekday].sort();
      if (days.join() === '1,2,3,4,5') return '평일마다';
      return `매주 ${days.map((d) => WEEKDAY[d]).join('·')}`;
    }
    case 'monthly':
      return `매월 ${rule.byMonthDay}일`;
  }
}
