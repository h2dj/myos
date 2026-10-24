import { describe, expect, it } from 'vitest';
import { calendarRange, calendarTaskDates, shiftCalendarDate } from './calendar';

describe('calendar', () => {
  it('handles leap days and rejects impossible query dates', () => {
    expect(shiftCalendarDate('2024-02-28', 1)).toBe('2024-02-29');
    expect(calendarRange('2025-02-30', 'month', '2026-10-25').date).toBe('2026-10-25');
    const month = calendarRange('2024-02-29', 'month', '2026-10-25');
    expect(month.start).toBe('2024-01-28');
    expect(month.days).toHaveLength(42);
    expect(calendarRange('2026-01-01', 'week', '2026-10-25').start).toBe('2025-12-28');
  });
  it('includes multi-day schedules and independent deadlines in the user timezone', () => {
    const task = {
      scheduledStart: new Date('2026-10-24T15:00:00Z'),
      scheduledEnd: new Date('2026-10-26T15:00:00Z'),
      dueAt: new Date('2026-10-28T14:59:59Z'),
    };
    expect(calendarTaskDates(task, '2026-10-26', 'Asia/Seoul')).toEqual({
      scheduled: true,
      due: false,
    });
    expect(calendarTaskDates(task, '2026-10-28', 'Asia/Seoul')).toEqual({
      scheduled: false,
      due: true,
    });
    expect(calendarTaskDates(task, '2026-10-24', 'Asia/Seoul').scheduled).toBe(false);
  });
});
