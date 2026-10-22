'use client';

import { TASK_STATUS_LABEL } from '@/lib/labels';
import {
  TASK_BUCKETS,
  TASK_BUCKET_LABELS,
  groupTasksByBucket,
  utcToLocalDate,
  type TaskBucket,
} from '@myos/core';
import type { ProjectWithProgress, TaskQuickAction, TaskStatus, TaskWithTags } from '@myos/domain';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useMemo, useOptimistic, useState, useTransition } from 'react';
import { setTaskStatusAction, taskQuickAction } from '@/server/actions/tasks';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { Select } from '../ui/field';
import { FormMessage } from '../ui/form-message';
import { QuickAddTask } from './quick-add-task';
import { TaskForm } from './task-form';
import { TaskRow } from './task-row';
import { DeleteTaskButton, StopSeriesButton } from './task-actions';

type ProjectOption = Pick<ProjectWithProgress, 'id' | 'name'>;

export function TaskView({
  tasks,
  projects,
  timeZone,
  now,
  view,
  fixedProjectId,
}: {
  tasks: TaskWithTags[];
  projects: ProjectOption[];
  timeZone: string;
  now: string;
  view: 'list' | 'board';
  /** 프로젝트 상세에서 쓸 때: 새 할 일을 이 프로젝트에 넣고 프로젝트 필터를 숨긴다 */
  fixedProjectId?: string;
}) {
  const [optimistic, applyStatus] = useOptimistic(
    tasks,
    (state, { id, status }: { id: string; status: TaskStatus }) =>
      state.map((t) => (t.id === id ? { ...t, status } : t)),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState<TaskWithTags | null>(null);
  const [creating, setCreating] = useState(false);
  const [filters, setFilters] = useState({ projectId: '', priority: '', tag: '' });

  const allTags = useMemo(
    () => [...new Set(tasks.flatMap((t) => t.tags.map((x) => x.name)))].sort(),
    [tasks],
  );
  const filtered = optimistic.filter(
    (t) =>
      (!filters.projectId || t.projectId === filters.projectId) &&
      (!filters.priority || t.priority === filters.priority) &&
      (!filters.tag || t.tags.some((x) => x.name === filters.tag)),
  );

  function changeStatus(task: TaskWithTags, status: TaskStatus) {
    setError(undefined);
    startTransition(async () => {
      applyStatus({ id: task.id, status });
      const res = await setTaskStatusAction(task.id, status);
      if (!res.ok) setError(res.error);
    });
  }
  const toggle = (task: TaskWithTags) =>
    changeStatus(task, task.status === 'done' ? 'todo' : 'done');

  function quickAction(task: TaskWithTags, action: TaskQuickAction) {
    setError(undefined);
    startTransition(async () => {
      const res = await taskQuickAction(task.id, action);
      if (!res.ok) setError(res.error);
    });
  }

  const today = utcToLocalDate(new Date(now), timeZone);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <QuickAddTask defaultDate={today} projectId={fixedProjectId} />
        <Button onClick={() => setCreating(true)} variant="secondary">
          <Plus className="size-4" /> 자세히 추가
        </Button>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="필터">
        {!fixedProjectId && (
          <Select
            aria-label="프로젝트 필터"
            className="!w-auto"
            value={filters.projectId}
            onChange={(e) => setFilters({ ...filters, projectId: e.target.value })}
          >
            <option value="">프로젝트 전체</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        )}
        <Select
          aria-label="우선순위 필터"
          className="!w-auto"
          value={filters.priority}
          onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
        >
          <option value="">우선순위 전체</option>
          <option value="high">높음</option>
          <option value="medium">보통</option>
          <option value="low">낮음</option>
        </Select>
        <Select
          aria-label="태그 필터"
          className="!w-auto"
          value={filters.tag}
          onChange={(e) => setFilters({ ...filters, tag: e.target.value })}
        >
          <option value="">태그 전체</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </div>

      <FormMessage error={error} />

      {view === 'list' ? (
        <BucketList
          tasks={filtered}
          timeZone={timeZone}
          now={new Date(now)}
          onQuickAction={quickAction}
          pending={pending}
          onToggle={toggle}
          onOpen={setEditing}
        />
      ) : (
        <Board tasks={filtered} onStatus={changeStatus} onOpen={setEditing} />
      )}

      <Dialog open={creating} onClose={() => setCreating(false)} title="할 일 추가">
        <TaskForm
          projects={projects}
          timeZone={timeZone}
          defaults={{ projectId: fixedProjectId, date: today }}
          onDone={() => setCreating(false)}
        />
      </Dialog>
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title="할 일 편집">
        {editing && (
          <>
            <TaskForm
              key={editing.id}
              task={editing}
              projects={projects}
              timeZone={timeZone}
              onDone={() => setEditing(null)}
            />
            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
              <DeleteTaskButton taskId={editing.id} onDeleted={() => setEditing(null)} />
              {editing.seriesId && (
                <StopSeriesButton seriesId={editing.seriesId} onStopped={() => setEditing(null)} />
              )}
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}

function BucketList({
  tasks,
  timeZone,
  now,
  onToggle,
  onOpen,
  onQuickAction,
  pending,
}: {
  tasks: TaskWithTags[];
  timeZone: string;
  now: Date;
  onQuickAction: (t: TaskWithTags, action: TaskQuickAction) => void;
  pending: boolean;
  onToggle: (t: TaskWithTags) => void;
  onOpen: (t: TaskWithTags) => void;
}) {
  const groups = groupTasksByBucket(tasks, now, timeZone);
  const [collapsed, setCollapsed] = useState<Set<TaskBucket>>(new Set(['later', 'someday']));

  if (tasks.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-surface py-12 text-center text-sm text-muted">
        할 일이 없습니다. 위에서 바로 추가해 보세요.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {TASK_BUCKETS.filter((b) => groups[b].length > 0).map((bucket) => {
        const items = groups[bucket];
        const done = items.filter((t) => t.status === 'done').length;
        const isOpen = !collapsed.has(bucket);
        return (
          <section key={bucket} className="rounded-xl border border-border bg-surface">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => {
                const next = new Set(collapsed);
                if (isOpen) next.add(bucket);
                else next.delete(bucket);
                setCollapsed(next);
              }}
              className="flex w-full items-center gap-2 px-4 py-3 text-left"
            >
              {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              <span className={`font-semibold ${bucket === 'overdue' ? 'text-danger' : ''}`}>
                {TASK_BUCKET_LABELS[bucket]}
              </span>
              <span className="text-sm text-muted">
                {done}/{items.length}
              </span>
            </button>
            {isOpen && (
              <ul className="px-2 pb-2">
                {items.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    timeZone={timeZone}
                    now={now}
                    pending={pending}
                    onQuickAction={onQuickAction}
                    onToggle={onToggle}
                    onOpen={onOpen}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

const BOARD_COLUMNS: TaskStatus[] = ['todo', 'in_progress', 'done'];

function Board({
  tasks,
  onStatus,
  onOpen,
}: {
  tasks: TaskWithTags[];
  onStatus: (t: TaskWithTags, s: TaskStatus) => void;
  onOpen: (t: TaskWithTags) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {BOARD_COLUMNS.map((status) => {
        const items = tasks.filter((t) => t.status === status);
        return (
          <section
            key={status}
            className="rounded-xl bg-surface-muted p-3"
            aria-label={TASK_STATUS_LABEL[status]}
          >
            <h2 className="mb-3 px-1 text-sm font-semibold">
              {TASK_STATUS_LABEL[status]} <span className="text-muted">{items.length}</span>
            </h2>
            <ul className="space-y-2">
              {items.map((t) => (
                <li key={t.id} className="rounded-lg border border-border bg-surface p-3 shadow-xs">
                  <button
                    type="button"
                    onClick={() => onOpen(t)}
                    className="text-left text-sm font-medium"
                  >
                    {t.title}
                  </button>
                  {t.projectName && <p className="mt-1 text-xs text-muted">{t.projectName}</p>}
                  <Select
                    aria-label={`${t.title} 상태`}
                    value={t.status}
                    onChange={(e) => onStatus(t, e.target.value as TaskStatus)}
                    className="mt-2 !py-1 text-xs"
                  >
                    {Object.entries(TASK_STATUS_LABEL).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
