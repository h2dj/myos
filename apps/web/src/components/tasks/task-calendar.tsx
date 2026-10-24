'use client';

import Link from 'next/link';
import { calendarRange, calendarTaskDates, shiftCalendarDate } from '@myos/core';
import type { TaskWithTags } from '@myos/domain';

export function TaskCalendar({
  tasks,
  date,
  mode,
  today,
  timeZone,
  onOpen,
  onCreate,
}: {
  tasks: TaskWithTags[];
  date: string;
  mode: 'month' | 'week';
  today: string;
  timeZone: string;
  onOpen: (task: TaskWithTags) => void;
  onCreate: (day: string) => void;
}) {
  const range = calendarRange(date, mode, today);
  const href = (day: string, nextMode = mode) =>
    `/tasks?view=calendar&mode=${nextMode}&date=${day}`;
  const adjacent = (direction: number) => {
    if (mode === 'week') return shiftCalendarDate(date, direction * 7);
    const value = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
    value.setUTCMonth(value.getUTCMonth() + direction);
    return value.toISOString().slice(0, 10);
  };
  return (
    <section aria-label="할 일 캘린더" className="space-y-3">
      <nav aria-label="캘린더 탐색" className="flex flex-wrap items-center gap-3 text-sm">
        <Link href={href(adjacent(-1))} aria-label="이전 기간">
          ← 이전
        </Link>
        <h2 className="font-semibold">
          {mode === 'month'
            ? date.slice(0, 7)
            : `${range.start} ~ ${shiftCalendarDate(range.end, -1)}`}
        </h2>
        <Link href={href(adjacent(1))} aria-label="다음 기간">
          다음 →
        </Link>
        <Link href={href(today)}>오늘</Link>
        <Link href={href(date, 'month')} aria-current={mode === 'month' ? 'page' : undefined}>
          월간
        </Link>
        <Link href={href(date, 'week')} aria-current={mode === 'week' ? 'page' : undefined}>
          주간
        </Link>
      </nav>
      <p className="text-xs text-muted">
        사용자 시간대: {timeZone} · 예정 기간과 마감일을 표시합니다. 날짜의 + 버튼으로 추가하세요.
      </p>
      {tasks.length === 500 && (
        <p role="status" className="text-sm text-danger">
          최대 500건을 표시합니다. 주간 보기로 범위를 줄여 주세요.
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <div className="min-w-[700px]">
          <div className="grid grid-cols-7 border-b border-border text-center text-sm text-muted">
            {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
              <div key={day} className="p-2">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {range.days.map((day) => (
              <section
                key={day}
                aria-label={day}
                className={`min-h-32 border-b border-r border-border p-2 ${day === today ? 'bg-surface-muted' : ''}`}
              >
                <div className="mb-2 flex items-center justify-between gap-1">
                  <time
                    dateTime={day}
                    aria-current={day === today ? 'date' : undefined}
                    className={`text-sm ${day.slice(0, 7) !== date.slice(0, 7) && mode === 'month' ? 'text-muted' : 'font-semibold'}`}
                  >
                    {Number(day.slice(-2))}
                  </time>
                  <button
                    type="button"
                    aria-label={`${day} 할 일 추가`}
                    onClick={() => onCreate(day)}
                    className="rounded px-2 hover:bg-surface-muted"
                  >
                    +
                  </button>
                </div>
                <ul className="space-y-1">
                  {tasks.map((task) => {
                    const { scheduled, due } = calendarTaskDates(task, day, timeZone);
                    if (!scheduled && !due) return null;
                    return (
                      <li key={task.id}>
                        <button
                          type="button"
                          onClick={() => onOpen(task)}
                          className={`w-full rounded border border-border p-1 text-left text-xs break-words hover:bg-surface-muted ${task.status === 'done' || task.status === 'cancelled' ? 'text-muted line-through' : ''}`}
                        >
                          <span className={due ? 'text-danger' : 'text-muted'}>
                            {scheduled && due
                              ? '예정·마감'
                              : due
                                ? '마감'
                                : task.allDay
                                  ? '종일'
                                  : '예정'}
                          </span>{' '}
                          {task.title}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>
      {tasks.length === 0 && (
        <p className="text-sm text-muted">이 기간에 예정된 할 일이 없습니다.</p>
      )}
    </section>
  );
}
