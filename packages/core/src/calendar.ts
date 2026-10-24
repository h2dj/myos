import { utcToLocalDate } from './local-date';

export function shiftCalendarDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function calendarRange(raw: string | undefined, mode: 'month' | 'week', today: string) {
  const valid =
    raw &&
    /^\d{4}-\d{2}-\d{2}$/.test(raw) &&
    !Number.isNaN(Date.parse(`${raw}T12:00:00Z`)) &&
    new Date(`${raw}T12:00:00Z`).toISOString().slice(0, 10) === raw &&
    raw >= '1900-01-01' &&
    raw <= '2100-12-31';
  const date = valid ? raw : today;
  const first = mode === 'month' ? `${date.slice(0, 7)}-01` : date;
  const weekday = new Date(`${first}T12:00:00Z`).getUTCDay();
  const start = shiftCalendarDate(first, -weekday);
  const count = mode === 'month' ? 42 : 7;
  return {
    date,
    start,
    end: shiftCalendarDate(start, count),
    days: Array.from({ length: count }, (_, i) => shiftCalendarDate(start, i)),
  };
}

export function calendarTaskDates(
  task: { scheduledStart: Date | null; scheduledEnd: Date | null; dueAt: Date | null },
  day: string,
  timeZone: string,
) {
  const local = (date: Date) => utcToLocalDate(new Date(date), timeZone);
  const start = task.scheduledStart ? local(task.scheduledStart) : null;
  const end = task.scheduledEnd ? local(task.scheduledEnd) : start;
  return {
    scheduled: !!start && day >= start && day <= (end ?? start),
    due: !!task.dueAt && local(task.dueAt) === day,
  };
}
