'use client';

import { formatLocalDay, taskAnchorDate } from '@myos/core';
import type { TaskWithTags } from '@myos/domain';
import { MoreHorizontal } from 'lucide-react';
import { PriorityBadge, TagChip } from '../ui/badges';

export function TaskRow({
  task,
  timeZone,
  onToggle,
  onOpen,
}: {
  task: TaskWithTags;
  timeZone: string;
  onToggle: (task: TaskWithTags) => void;
  onOpen: (task: TaskWithTags) => void;
}) {
  const done = task.status === 'done';
  const anchor = taskAnchorDate(task);
  return (
    <li className="group flex items-center gap-3 border-b border-border px-2 py-2.5 last:border-b-0">
      <input
        type="checkbox"
        checked={done}
        onChange={() => onToggle(task)}
        aria-label={`${task.title} ${done ? '완료 취소' : '완료'}`}
        className="size-4 shrink-0 accent-accent"
      />
      <button
        type="button"
        onClick={() => onOpen(task)}
        className={`min-w-0 flex-1 truncate text-left text-sm ${done ? 'text-muted line-through' : ''} ${task.status === 'cancelled' ? 'text-muted line-through' : ''}`}
      >
        {task.title}
      </button>
      <div className="hidden items-center gap-1.5 sm:flex">
        {task.tags.slice(0, 3).map((t) => (
          <TagChip key={t.id} name={t.name} />
        ))}
      </div>
      {task.projectName && (
        <span className="hidden max-w-32 truncate text-xs text-muted md:inline">
          {task.projectName}
        </span>
      )}
      <PriorityBadge priority={task.priority} />
      {anchor && (
        <span className="shrink-0 text-xs text-muted">
          {formatLocalDay(new Date(anchor), timeZone)}
        </span>
      )}
      <button
        type="button"
        onClick={() => onOpen(task)}
        aria-label={`${task.title} 편집`}
        className="rounded p-1 text-muted opacity-60 group-hover:opacity-100 hover:bg-surface-muted"
      >
        <MoreHorizontal className="size-4" />
      </button>
    </li>
  );
}
