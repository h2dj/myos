import {
  getOrCreateDashboard,
  listProjects,
  listTags,
  listWidgets,
  loadDashboardData,
} from '@myos/domain';
import type { Metadata } from 'next';
import { DashboardView } from '@/components/dashboard/dashboard-view';
import { PageHeader } from '@/components/page-header';
import { requireSession } from '@/server/auth/session';
import { db } from '@/server/db';

export const metadata: Metadata = { title: '대시보드' };

export default async function DashboardPage() {
  const { actor, user, workspace } = await requireSession();
  const now = new Date();
  const dashboard = await getOrCreateDashboard(db, actor, workspace.id);
  const [widgets, projects, tags] = await Promise.all([
    listWidgets(db, actor, dashboard.id),
    listProjects(db, actor, {
      workspaceId: workspace.id,
      status: ['planned', 'active', 'on_hold'],
    }),
    listTags(db, actor, workspace.id),
  ]);
  const data = await loadDashboardData(db, actor, {
    dashboard,
    widgets,
    now,
    timeZone: user.timezone,
  });
  const today = new Intl.DateTimeFormat('ko-KR', {
    timeZone: user.timezone,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(now);

  return (
    <>
      <PageHeader
        title={`좋은 하루예요, ${user.name}님! ☀️`}
        description={`${today} · 오늘도 한 걸음, 더 나아가요.`}
      />
      <DashboardView
        dashboard={dashboard}
        widgets={widgets}
        data={data}
        areas={{
          projects: projects.map((p) => ({ id: p.id, name: p.name })),
          tags: tags.map((t) => t.name),
        }}
        timeZone={user.timezone}
      />
    </>
  );
}
