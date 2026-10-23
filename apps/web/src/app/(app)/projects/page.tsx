import { formatLocalDay, projectPath } from '@myos/core';
import { listProjects, type ProjectStatus } from '@myos/domain';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { NewProjectButton } from '@/components/projects/project-dialogs';
import { PROJECT_STATUS_LABEL } from '@/lib/labels';
import { ProgressBar } from '@/components/ui/badges';
import { LinkTabs } from '@/components/ui/tabs';
import { requireSession } from '@/server/auth/session';
import { db } from '@/server/db';

export const metadata: Metadata = { title: '프로젝트' };

const TABS: Record<string, { label: string; status?: ProjectStatus[] }> = {
  all: { label: '전체', status: ['planned', 'active', 'on_hold', 'completed'] },
  active: { label: '진행 중', status: ['planned', 'active', 'on_hold'] },
  completed: { label: '완료', status: ['completed'] },
  archived: { label: '보관함', status: ['archived'] },
};

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: rawTab } = await searchParams;
  const tab = rawTab && rawTab in TABS ? rawTab : 'all';
  const { actor, workspace, user } = await requireSession();
  const allProjects = await listProjects(db, actor, { workspaceId: workspace.id });
  const projects = allProjects.filter(
    (p) => !TABS[tab]!.status || TABS[tab]!.status!.includes(p.status),
  );
  const fmt = (d: Date | null) => (d ? formatLocalDay(d, user.timezone) : '—');

  return (
    <>
      <PageHeader
        title="프로젝트"
        description="프로젝트 진행 현황과 관련 할 일을 관리합니다."
        actions={<NewProjectButton timeZone={user.timezone} projects={allProjects} />}
      />
      <LinkTabs
        active={tab}
        tabs={Object.entries(TABS).map(([key, t]) => ({
          key,
          label: t.label,
          href: key === 'all' ? '/projects' : `/projects?tab=${key}`,
        }))}
      />
      {projects.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface py-12 text-center text-sm text-muted">
          프로젝트가 없습니다.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[...projects]
            .sort((a, b) =>
              projectPath(a, allProjects).localeCompare(projectPath(b, allProjects), 'ko'),
            )
            .map((p) => (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  className="block h-full rounded-xl border border-border bg-surface p-5 transition hover:border-accent"
                >
                  {p.parentId && (
                    <p className="mb-2 text-xs text-muted">{projectPath(p, allProjects)}</p>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold">{p.name}</h2>
                    <span className="shrink-0 rounded-md bg-surface-muted px-1.5 py-0.5 text-xs">
                      {PROJECT_STATUS_LABEL[p.status]}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-muted">
                    {p.progress}% · 할 일 {p.taskDone}/{p.taskTotal}
                  </p>
                  <div className="mt-1.5">
                    <ProgressBar value={p.progress} />
                  </div>
                  <p className="mt-3 text-xs text-muted">
                    {p.startAt || p.dueAt ? `${fmt(p.startAt)} – ${fmt(p.dueAt)}` : '기간 미정'}
                  </p>
                </Link>
              </li>
            ))}
        </ul>
      )}
    </>
  );
}
