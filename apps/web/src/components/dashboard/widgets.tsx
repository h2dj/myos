'use client';

import { formatLocalDay, KPI_METRICS } from '@myos/core';
import type { TaskStatus, TaskWithTags, WidgetData } from '@myos/domain';
import { ArrowRight, Zap } from 'lucide-react';
import Link from 'next/link';
import { useOptimistic, useTransition } from 'react';
import { setTaskStatusAction } from '@/server/actions/tasks';
import { QuickCapture } from '../inbox/quick-capture';
import { PriorityBadge, ProgressBar, TagChip } from '../ui/badges';

/** 위젯 종류별 본문. 데이터는 서버(loadDashboardData)에서 계산되어 온다. */
export function WidgetBody({ data, timeZone }: { data: WidgetData; timeZone: string }) {
  switch (data.type) {
    case 'tasks':
      return <TasksWidget data={data} />;
    case 'schedule':
      return <ScheduleWidget data={data} timeZone={timeZone} />;
    case 'projects':
      return <ProjectsWidget data={data} />;
    case 'inbox':
      return <InboxWidget data={data} />;
    case 'automations':
      return (
        <Empty icon={<Zap className="size-5" />}>
          자동화 규칙이 아직 없습니다. 자동화 센터는 3단계에서 제공됩니다.
        </Empty>
      );
    case 'kpi':
      return <KpiWidget data={data} />;
    case 'recent_notes':
      return <RecentNotesWidget data={data} timeZone={timeZone} />;
    case 'shortcuts':
      return (
        <ul className="grid grid-cols-2 gap-2">
          {data.links.map((l) => (
            <li key={`${l.href}-${l.label}`}>
              <Link
                href={l.href}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-muted"
              >
                {l.label} <ArrowRight className="size-3.5 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      );
  }
}

/** 위젯 제목 옆에 붙는 요약(예: 할 일 3/8) */
export function widgetBadge(data: WidgetData | undefined): string | null {
  if (data?.type === 'tasks') return `${data.done}/${data.total}`;
  if (data?.type === 'inbox' && data.pending > 0) return String(data.pending);
  return null;
}

function Empty({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted">
      {icon}
      <p>{children}</p>
    </div>
  );
}

function TasksWidget({ data }: { data: Extract<WidgetData, { type: 'tasks' }> }) {
  const [items, apply] = useOptimistic(
    data.items,
    (state, { id, status }: { id: string; status: TaskStatus }) =>
      state.map((t) => (t.id === id ? { ...t, status } : t)),
  );
  const [, startTransition] = useTransition();
  const toggle = (t: TaskWithTags) => {
    const status = t.status === 'done' ? 'todo' : 'done';
    startTransition(async () => {
      apply({ id: t.id, status });
      await setTaskStatusAction(t.id, status);
    });
  };

  if (items.length === 0) return <Empty>이 기간에 할 일이 없습니다.</Empty>;
  return (
    <>
      <ul className="space-y-1">
        {items.map((t) => {
          const done = t.status === 'done';
          return (
            <li key={t.id} className="flex items-center gap-2 py-1">
              <input
                type="checkbox"
                checked={done}
                onChange={() => toggle(t)}
                aria-label={`${t.title} ${done ? '완료 취소' : '완료'}`}
                className="size-4 accent-accent"
              />
              <span
                className={`min-w-0 flex-1 truncate text-sm ${done ? 'text-muted line-through' : ''}`}
              >
                {t.title}
              </span>
              {t.tags[0] && <TagChip name={t.tags[0].name} />}
              <PriorityBadge priority={t.priority} />
            </li>
          );
        })}
      </ul>
      {data.total > items.length && (
        <Link href="/tasks" className="mt-2 inline-block text-xs text-accent">
          {data.total - items.length}개 더 보기
        </Link>
      )}
    </>
  );
}

function ScheduleWidget({
  data,
  timeZone,
}: {
  data: Extract<WidgetData, { type: 'schedule' }>;
  timeZone: string;
}) {
  if (data.days.length === 0) return <Empty>예정된 일정이 없습니다.</Empty>;
  const time = new Intl.DateTimeFormat('ko-KR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return (
    <div className="space-y-3">
      {data.days.map((d) => (
        <div key={d.date}>
          <p className="mb-1 text-xs font-semibold">
            {formatLocalDay(new Date(`${d.date}T12:00:00Z`), 'UTC')}
          </p>
          <ul className="space-y-1">
            {d.items.map((t) => (
              <li key={t.id} className="flex gap-3 text-sm">
                <span className="min-w-8 shrink-0 text-xs text-muted tabular-nums">
                  {t.allDay
                    ? '종일'
                    : `${time.format(t.scheduledStart!)}${t.scheduledEnd ? ` - ${time.format(t.scheduledEnd)}` : ''}`}
                </span>
                <span
                  className={`truncate ${t.status === 'done' ? 'text-muted line-through' : ''}`}
                >
                  {t.title}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ProjectsWidget({ data }: { data: Extract<WidgetData, { type: 'projects' }> }) {
  if (data.items.length === 0) return <Empty>진행 중인 프로젝트가 없습니다.</Empty>;
  return (
    <ul className="space-y-3">
      {data.items.map((p) => (
        <li key={p.id}>
          <Link href={`/projects/${p.id}`} className="block hover:opacity-80">
            <div className="mb-1 flex justify-between text-sm">
              <span className="truncate font-medium">{p.name}</span>
              <span className="text-xs text-muted">{p.progress}%</span>
            </div>
            <ProgressBar value={p.progress} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function InboxWidget({ data }: { data: Extract<WidgetData, { type: 'inbox' }> }) {
  return (
    <div className="space-y-3">
      <QuickCapture source="dashboard" />
      {data.pending > 0 && (
        <Link href="/inbox" className="flex items-center justify-between text-xs text-accent">
          분류 대기 {data.pending}개 <ArrowRight className="size-3.5" />
        </Link>
      )}
    </div>
  );
}

function KpiWidget({ data }: { data: Extract<WidgetData, { type: 'kpi' }> }) {
  return (
    <div>
      <p className={`text-2xl font-bold tabular-nums ${data.value === null ? 'text-muted' : ''}`}>
        {data.value ?? '—'}
      </p>
      <p className="mt-1 text-xs text-muted">
        {data.metric ? `${KPI_METRICS[data.metric]} · ${data.hint}` : '데이터 소스 미설정'}
      </p>
    </div>
  );
}

function RecentNotesWidget({
  data,
  timeZone,
}: {
  data: Extract<WidgetData, { type: 'recent_notes' }>;
  timeZone: string;
}) {
  if (data.items.length === 0) return <Empty>최근 메모가 없습니다.</Empty>;
  return (
    <ul className="space-y-2">
      {data.items.map((n) => (
        <li key={n.id}>
          <Link
            href={`/knowledge/${n.id}`}
            className="flex justify-between gap-2 text-sm hover:text-accent"
          >
            <span className="truncate">{n.title}</span>
            <span className="shrink-0 text-xs text-muted">
              {formatLocalDay(n.updatedAt, timeZone)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
