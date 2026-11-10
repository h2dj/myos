'use client';

import Link from 'next/link';
import { RelatedItemsPanel } from '../relations/related-items-panel';
import { TaskCalendar } from './task-calendar';
import { TASK_STATUS_LABEL } from '@/lib/labels';
import {
  TASK_BUCKETS,
  TASK_BUCKET_LABELS,
  groupTasksByBucket,
  utcToLocalDate,
  type TaskBucket,
} from '@myos/core';
import type {
  Activity,
  ActivityPlace,
  ProjectWithProgress,
  TaskQuickAction,
  TaskStatus,
  TaskWithTags,
} from '@myos/domain';
import { CheckCheck, CheckSquare, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { type DragEvent, useMemo, useOptimistic, useState, useTransition } from 'react';
import {
  completeOverdueTasksAction,
  setTaskStatusAction,
  taskQuickAction,
} from '@/server/actions/tasks';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { Select } from '../ui/field';
import { FormMessage } from '../ui/form-message';
import { QuickAddTask } from './quick-add-task';
import { TaskForm } from './task-form';
import { TaskRow } from './task-row';
import { DeleteTaskButton, StopSeriesButton } from './task-actions';
import { TaskBulkEditBar, useTaskSelection, type TaskSelection } from './task-bulk-edit';

type ProjectOption = Pick<ProjectWithProgress, 'id' | 'name' | 'parentId'>;

export function TaskView({
  tasks,
  projects,
  timeZone,
  now,
  view,
  fixedProjectId,
  calendarDate,
  calendarMode,
  activities,
  activityPlaces,
}: {
  tasks: TaskWithTags[];
  projects: ProjectOption[];
  activities: Activity[];
  activityPlaces: ActivityPlace[];
  timeZone: string;
  now: string;
  view: 'list' | 'board' | 'calendar';
  calendarDate?: string;
  calendarMode?: 'month' | 'week';
  /** 프로젝트 상세에서 쓸 때: 새 할 일을 이 프로젝트에 넣고 프로젝트 필터를 숨긴다 */
  fixedProjectId?: string;
}) {
  const [optimistic, applyOptimistic] = useOptimistic(
    tasks,
    (state, change: { id: string; status: TaskStatus } | { hide: string[] }): TaskWithTags[] => {
      if ('hide' in change) {
        const hidden = new Set(change.hide);
        return state.filter((t) => !hidden.has(t.id));
      }
      return state.map((t) => (t.id === change.id ? { ...t, status: change.status } : t));
    },
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState<TaskWithTags | null>(null);
  const [creating, setCreating] = useState(false);
  const [createDate, setCreateDate] = useState<string>();
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
      applyOptimistic({ id: task.id, status });
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

  // 지난 할 일은 각자의 날짜에 완료한 것으로 기록되어 목록에서 바로 사라진다
  function completeOverdue(items: TaskWithTags[]) {
    setError(undefined);
    const ids = items.map((t) => t.id);
    startTransition(async () => {
      applyOptimistic({ hide: ids });
      const res = await completeOverdueTasksAction(ids);
      if (!res.ok) setError(res.error);
    });
  }

  const today = utcToLocalDate(new Date(now), timeZone);
  const [selecting, setSelecting] = useState(false);
  const visibleIds = useMemo(() => filtered.map((t) => t.id), [filtered]);
  const selection = useTaskSelection(visibleIds);

  return (
    <div className="space-y-4">
      <QuickAddTask defaultDate={today} projectId={fixedProjectId}>
        <Button
          onClick={() => {
            setCreateDate(undefined);
            setCreating(true);
          }}
          variant="secondary"
        >
          <Plus className="size-4" /> 자세히 추가
        </Button>
        {view === 'list' && (
          <Button
            variant="secondary"
            aria-pressed={selecting}
            onClick={() => {
              if (selecting) selection.clear();
              setSelecting(!selecting);
            }}
          >
            <CheckSquare className="size-4" /> 여러 개 선택
          </Button>
        )}
      </QuickAddTask>

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

      {selecting && view === 'list' && (
        <TaskBulkEditBar
          selection={selection}
          projects={projects}
          activities={activities}
          activityPlaces={activityPlaces}
          hideProject={!!fixedProjectId}
          onClose={() => {
            selection.clear();
            setSelecting(false);
          }}
        />
      )}

      {view === 'calendar' ? (
        <TaskCalendar
          tasks={filtered}
          date={calendarDate!}
          mode={calendarMode!}
          today={today}
          timeZone={timeZone}
          onOpen={setEditing}
          onCreate={(day) => {
            setCreateDate(day);
            setCreating(true);
          }}
        />
      ) : view === 'list' ? (
        <BucketList
          tasks={filtered}
          timeZone={timeZone}
          now={new Date(now)}
          onQuickAction={quickAction}
          onCompleteOverdue={completeOverdue}
          pending={pending}
          onStatus={changeStatus}
          onToggle={toggle}
          onOpen={setEditing}
          selection={selecting ? selection : undefined}
        />
      ) : (
        <Board tasks={filtered} onStatus={changeStatus} onOpen={setEditing} />
      )}

      <Dialog open={creating} onClose={() => setCreating(false)} title="할 일 추가">
        <TaskForm
          projects={projects}
          activities={activities}
          activityPlaces={activityPlaces}
          timeZone={timeZone}
          defaults={{ projectId: fixedProjectId, date: createDate ?? today }}
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
              activities={activities}
              activityPlaces={activityPlaces}
              timeZone={timeZone}
              onDone={() => setEditing(null)}
            />
            <div className="mt-4">
              <RelatedItemsPanel key={editing.id} source={{ type: 'task', id: editing.id }} />
            </div>
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
  onStatus,
  onOpen,
  onQuickAction,
  onCompleteOverdue,
  pending,
  selection,
}: {
  tasks: TaskWithTags[];
  timeZone: string;
  now: Date;
  selection?: TaskSelection;
  onQuickAction: (t: TaskWithTags, action: TaskQuickAction) => void;
  onCompleteOverdue: (items: TaskWithTags[]) => void;
  pending: boolean;
  onStatus: (task: TaskWithTags, status: TaskStatus) => void;
  onToggle: (t: TaskWithTags) => void;
  onOpen: (t: TaskWithTags) => void;
}) {
  const groups = groupTasksByBucket(tasks, now, timeZone);
  const [collapsed, setCollapsed] = useState<Set<TaskBucket>>(new Set(['later', 'someday']));
  const [confirmingOverdue, setConfirmingOverdue] = useState(false);

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
            <div className="flex items-center gap-2 pr-3">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => {
                  const next = new Set(collapsed);
                  if (isOpen) next.add(bucket);
                  else next.delete(bucket);
                  setCollapsed(next);
                }}
                className="flex min-w-0 flex-1 items-center gap-2 py-3 pl-4 text-left"
              >
                {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                <span className={`font-semibold ${bucket === 'overdue' ? 'text-danger' : ''}`}>
                  {TASK_BUCKET_LABELS[bucket]}
                </span>
                <span className="text-sm text-muted">
                  {done}/{items.length}
                </span>
              </button>
              {bucket === 'overdue' &&
                (confirmingOverdue ? (
                  <span className="flex shrink-0 items-center gap-1 text-sm">
                    <span className="hidden text-muted sm:inline">
                      {items.length}개를 각 날짜에 완료할까요?
                    </span>
                    <Button
                      className="!px-2 !py-1"
                      disabled={pending}
                      onClick={() => {
                        setConfirmingOverdue(false);
                        onCompleteOverdue(items);
                      }}
                    >
                      {items.length}개 완료
                    </Button>
                    <Button
                      className="!px-2 !py-1"
                      variant="ghost"
                      onClick={() => setConfirmingOverdue(false)}
                    >
                      취소
                    </Button>
                  </span>
                ) : (
                  <Button
                    className="!px-2 !py-1"
                    variant="secondary"
                    disabled={pending}
                    title="지난 할 일을 모두 각자의 날짜에 완료한 것으로 처리"
                    onClick={() => setConfirmingOverdue(true)}
                  >
                    <CheckCheck className="size-4" /> 모두 완료처리
                  </Button>
                ))}
            </div>
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
                    onStatus={onStatus}
                    onToggle={onToggle}
                    onOpen={onOpen}
                    selected={selection?.selected.has(t.id)}
                    onSelect={selection && ((task) => selection.toggle(task.id))}
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

const DRAG_TYPE = 'application/x-myos-task';

function Board({
  tasks,
  onStatus,
  onOpen,
}: {
  tasks: TaskWithTags[];
  onStatus: (t: TaskWithTags, s: TaskStatus) => void;
  onOpen: (t: TaskWithTags) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<TaskStatus | null>(null);

  function endDrag() {
    setDraggingId(null);
    setOverStatus(null);
  }

  function drop(e: DragEvent, status: TaskStatus) {
    e.preventDefault();
    const id = e.dataTransfer.getData(DRAG_TYPE) || draggingId;
    const task = tasks.find((t) => t.id === id);
    endDrag();
    if (task && task.status !== status) onStatus(task, status);
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {BOARD_COLUMNS.map((status) => {
        const items = tasks.filter((t) => t.status === status);
        const isOver = overStatus === status && draggingId !== null;
        return (
          <section
            key={status}
            className={`rounded-xl bg-surface-muted p-3 transition-shadow ${
              isOver ? 'ring-2 ring-accent' : ''
            }`}
            aria-label={TASK_STATUS_LABEL[status]}
            data-drop-target={status}
            onDragOver={(e) => {
              if (!draggingId && !e.dataTransfer.types.includes(DRAG_TYPE)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (overStatus !== status) setOverStatus(status);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setOverStatus((s) => (s === status ? null : s));
              }
            }}
            onDrop={(e) => drop(e, status)}
          >
            <h2 className="mb-3 px-1 text-sm font-semibold">
              {TASK_STATUS_LABEL[status]} <span className="text-muted">{items.length}</span>
            </h2>
            <ul className="min-h-12 space-y-2">
              {items.map((t) => (
                <li
                  key={t.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_TYPE, t.id);
                    e.dataTransfer.setData('text/plain', t.title);
                    e.dataTransfer.effectAllowed = 'move';
                    setDraggingId(t.id);
                  }}
                  onDragEnd={endDrag}
                  className={`cursor-grab rounded-lg border border-border bg-surface p-3 shadow-xs active:cursor-grabbing ${
                    draggingId === t.id ? 'opacity-50' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onOpen(t)}
                    className="text-left text-sm font-medium"
                  >
                    {t.title}
                  </button>
                  {t.projectName && t.projectId && (
                    <Link
                      href={`/projects/${t.projectId}`}
                      className="mt-1 block text-xs text-muted hover:text-accent hover:underline"
                      title={`${t.projectName} 프로젝트 정보`}
                    >
                      {t.projectName}
                    </Link>
                  )}
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
