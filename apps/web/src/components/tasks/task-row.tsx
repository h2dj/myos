'use client';

import { formatLocalDay, taskAnchorDate, utcToLocalDate } from '@myos/core';
import type { TaskQuickAction, TaskStatus, TaskWithTags } from '@myos/domain';
import Link from 'next/link';
import { MoreHorizontal, Repeat } from 'lucide-react';
import { TASK_STATUS_LABEL } from '@/lib/labels';
import { Select } from '../ui/field';
import { PriorityBadge, TagChip } from '../ui/badges';

export function TaskRow({
  task,
  timeZone,
  onToggle,
  onStatus,
  onOpen,
  now,
  pending,
  onQuickAction,
}: {
  task: TaskWithTags;
  timeZone: string;
  now: Date;
  pending: boolean;
  onQuickAction: (task: TaskWithTags, action: TaskQuickAction) => void;
  onStatus: (task: TaskWithTags, status: TaskStatus) => void;
  onToggle: (task: TaskWithTags) => void;
  onOpen: (task: TaskWithTags) => void;
}) {
  const done = task.status === 'done';
  const anchor = taskAnchorDate(task);
  const isOverdue =
    anchor &&
    utcToLocalDate(new Date(anchor), timeZone) < utcToLocalDate(now, timeZone) &&
    !done &&
    task.status !== 'cancelled';
  return (
    <li className="group flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-2 py-2.5 last:border-b-0">
      <input
        type="checkbox"
        checked={done}
        disabled={pending}
        onChange={() => onToggle(task)}
        aria-label={`${task.title} ${done ? '완료 취소' : '완료'}`}
        className="size-4 shrink-0 accent-accent"
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => onOpen(task)}
        className={`min-w-24 flex-1 truncate text-left text-sm ${done ? 'text-muted line-through' : ''} ${task.status === 'cancelled' ? 'text-muted line-through' : ''}`}
      >
        {task.seriesId && (
          <Repeat className="mr-1.5 inline size-3.5 text-muted" aria-label="반복" />
        )}
        {task.title}
      </button>
      <div className="hidden items-center gap-1.5 sm:flex">
        {task.tags.slice(0, 3).map((t) => (
          <TagChip key={t.id} name={t.name} />
        ))}
      </div>
      {task.projectName && task.projectId && (
        <Link
          href={`/projects/${task.projectId}`}
          className="max-w-32 truncate text-xs text-muted hover:text-accent hover:underline"
          title={`${task.projectName} 프로젝트 정보`}
        >
          {task.projectName}
        </Link>
      )}
      <Select
        aria-label={`${task.title} 상태`}
        value={task.status}
        disabled={pending}
        onChange={(e) => onStatus(task, e.target.value as TaskStatus)}
        className="!w-auto !py-1 text-xs"
      >
        {Object.entries(TASK_STATUS_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
      {(task.activityName || task.activityPlaceName) && (
        <span
          className="max-w-40 truncate text-xs text-muted"
          title={[task.activityName, task.activityPlaceName].filter(Boolean).join(' · ')}
        >
          {[task.activityName, task.activityPlaceName].filter(Boolean).join(' · ')}
        </span>
      )}
      <PriorityBadge priority={task.priority} />
      <div className="flex shrink-0 items-center gap-2">
        <div className="flex shrink-0 items-center gap-1" aria-label={`${task.title} 빠른 작업`}>
          {isOverdue && (
            <button
              type="button"
              aria-label={`${task.title} 오늘로`}
              disabled={pending}
              onClick={() => onQuickAction(task, 'today')}
              className="min-h-8 rounded px-1.5 text-xs text-muted hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              오늘로
            </button>
          )}
          {(
            [
              ['tomorrow', '내일로'],
              ['copyTomorrow', '내일도'],
              ['completeOnDate', '완료처리'],
            ] as const
          ).map(([action, label]) => (
            <button
              key={action}
              type="button"
              aria-label={`${task.title} ${label}`}
              title={
                action === 'completeOnDate' ? '지난 날짜의 할 일을 그 날 완료한 것으로 처리' : label
              }
              disabled={pending || (action === 'completeOnDate' && !isOverdue)}
              onClick={() => onQuickAction(task, action)}
              className="min-h-8 rounded px-1.5 text-xs text-muted hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              {label}
            </button>
          ))}
        </div>
        {anchor && (
          <span className="shrink-0 text-xs text-muted">
            {formatLocalDay(new Date(anchor), timeZone)}
          </span>
        )}
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => onOpen(task)}
        aria-label={`${task.title} 편집`}
        className="rounded p-1 text-muted opacity-60 group-hover:opacity-100 hover:bg-surface-muted"
      >
        <MoreHorizontal className="size-4" />
      </button>
    </li>
  );
}
