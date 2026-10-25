import { formatLocalDay, getPeriodRange, projectPath } from '@myos/core';
import {
  NotFoundError,
  getProject,
  listProjects,
  listTasks,
  listActivities,
  listActivityPlaces,
} from '@myos/domain';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { RelatedItemsPanel } from '@/components/relations/related-items-panel';
import { EditProjectButtons, NewProjectButton } from '@/components/projects/project-dialogs';
import { PROJECT_STATUS_LABEL } from '@/lib/labels';
import { TaskView } from '@/components/tasks/task-view';
import { ProgressBar } from '@/components/ui/badges';
import { requireSession } from '@/server/auth/session';
import { db } from '@/server/db';

export const metadata: Metadata = { title: '프로젝트' };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { actor, user } = await requireSession();
  const project = await getProject(db, actor, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const now = new Date();
  const [tasks, projects, activities, activityPlaces] = await Promise.all([
    listTasks(db, actor, {
      workspaceId: project.workspaceId,
      projectId: id,
      completedSince: getPeriodRange('week', now, user.timezone).start!,
    }),
    listProjects(db, actor, { workspaceId: project.workspaceId }),
    listActivities(db, actor, project.workspaceId),
    listActivityPlaces(db, actor, project.workspaceId),
  ]);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/projects" className="text-muted hover:text-foreground">
          ← 프로젝트
        </Link>
      </p>
      <PageHeader
        title={project.name}
        description={project.description ?? undefined}
        actions={
          <EditProjectButtons project={project} projects={projects} timeZone={user.timezone} />
        }
      />
      <div className="mb-6 grid gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted">상태</p>
          <p className="font-medium">{PROJECT_STATUS_LABEL[project.status]}</p>
        </div>
        <div>
          <p className="text-xs text-muted">기간</p>
          <p className="font-medium">
            {project.startAt ? formatLocalDay(project.startAt, user.timezone) : '—'} ~{' '}
            {project.dueAt ? formatLocalDay(project.dueAt, user.timezone) : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">
            진행률 {project.progress}% ({project.taskDone}/{project.taskTotal})
          </p>
          <div className="mt-2">
            <ProgressBar value={project.progress} />
          </div>
        </div>
      </div>

      {project.parentId && (
        <p className="mb-4 text-sm">
          상위 프로젝트:{' '}
          <Link href={`/projects/${project.parentId}`} className="text-accent">
            {projectPath(projects.find((p) => p.id === project.parentId) ?? project, projects)}
          </Link>
        </p>
      )}
      <section className="mb-6" aria-label="하위 프로젝트">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">하위 프로젝트</h2>
          <NewProjectButton
            defaultParentId={project.id}
            projects={projects}
            timeZone={user.timezone}
          />
        </div>
        <p className="mb-2 text-xs text-muted">
          진행률과 아래 할 일 목록은 이 프로젝트에 직접 연결된 항목 기준입니다.
        </p>
        {projects.filter((p) => p.parentId === project.id).length === 0 ? (
          <p className="text-sm text-muted">하위 프로젝트가 없습니다.</p>
        ) : (
          <ul>
            {projects
              .filter((p) => p.parentId === project.id)
              .map((p) => (
                <li key={p.id}>
                  <Link className="text-accent" href={`/projects/${p.id}`}>
                    {p.name}
                  </Link>
                </li>
              ))}
          </ul>
        )}
      </section>
      <p className="mb-4">
        <Link href={`/search?project=${id}`} className="text-accent">
          하위 프로젝트 포함 전체 항목 조회 →
        </Link>
      </p>
      <h2 className="mb-3 font-semibold">할 일</h2>
      <TaskView
        tasks={tasks}
        projects={projects}
        activities={activities}
        activityPlaces={activityPlaces}
        timeZone={user.timezone}
        now={now.toISOString()}
        view="list"
        fixedProjectId={id}
      />

      <div className="mt-8">
        <RelatedItemsPanel source={{ type: 'project', id }} />
      </div>
    </>
  );
}
