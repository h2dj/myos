import { getPeriodRange } from '@myos/core';
import { listProjects, listTasks, listActivities, listActivityPlaces } from '@myos/domain';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { RestoreTaskButton } from '@/components/tasks/task-actions';
import { TaskView } from '@/components/tasks/task-view';
import { LinkTabs } from '@/components/ui/tabs';
import { requireSession } from '@/server/auth/session';
import { db } from '@/server/db';

export const metadata: Metadata = { title: '할 일' };

const VIEWS = ['list', 'board', 'trash'] as const;
type View = (typeof VIEWS)[number];

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view: rawView } = await searchParams;
  const view: View = VIEWS.includes(rawView as View) ? (rawView as View) : 'list';
  const { actor, workspace, user } = await requireSession();
  const now = new Date();
  const { start: todayStart } = getPeriodRange('today', now, user.timezone);

  const [tasks, projects, activities, activityPlaces] = await Promise.all([
    listTasks(db, actor, {
      workspaceId: workspace.id,
      trash: view === 'trash',
      // 완료한 일은 오늘 완료분만 보여준다
      completedSince: view === 'trash' ? undefined : todayStart!,
      limit: 500,
    }),
    listProjects(db, actor, { workspaceId: workspace.id }),
    listActivities(db, actor, workspace.id),
    listActivityPlaces(db, actor, workspace.id),
  ]);

  return (
    <>
      <PageHeader title="할 일" description="상태·우선순위·마감으로 할 일을 관리합니다." />
      <LinkTabs
        active={view}
        tabs={[
          { key: 'list', label: '목록', href: '/tasks' },
          { key: 'board', label: '보드', href: '/tasks?view=board' },
          { key: 'calendar', label: '캘린더', href: '#', disabled: true },
          { key: 'eisenhower', label: '아이젠하워', href: '#', disabled: true },
          { key: 'trash', label: '휴지통', href: '/tasks?view=trash' },
        ]}
      />
      {view === 'trash' ? (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {tasks.length === 0 && (
            <li className="p-6 text-center text-sm text-muted">휴지통이 비어 있습니다.</li>
          )}
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="truncate text-sm">{t.title}</span>
              <RestoreTaskButton taskId={t.id} />
            </li>
          ))}
        </ul>
      ) : (
        <TaskView
          tasks={tasks}
          projects={projects}
          activities={activities}
          activityPlaces={activityPlaces}
          timeZone={user.timezone}
          now={now.toISOString()}
          view={view}
        />
      )}
    </>
  );
}
