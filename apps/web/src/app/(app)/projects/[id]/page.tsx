import { formatLocalDay, getPeriodRange } from '@myos/core';
import { NotFoundError, getProject, listNotes, listProjects, listTasks } from '@myos/domain';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { EditProjectButtons } from '@/components/projects/project-dialogs';
import { PROJECT_STATUS_LABEL } from '@/lib/labels';
import { TaskView } from '@/components/tasks/task-view';
import { ProgressBar } from '@/components/ui/badges';
import { requireSession } from '@/server/auth/session';
import { db } from '@/server/db';

export const metadata: Metadata = { title: '프로젝트' };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { actor, workspace, user } = await requireSession();
  const project = await getProject(db, actor, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const now = new Date();
  const [tasks, notes, projects] = await Promise.all([
    listTasks(db, actor, {
      workspaceId: project.workspaceId,
      projectId: id,
      completedSince: getPeriodRange('week', now, user.timezone).start!,
    }),
    listNotes(db, actor, { workspaceId: project.workspaceId, projectId: id, limit: 20 }),
    listProjects(db, actor, { workspaceId: workspace.id }),
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
        actions={<EditProjectButtons project={project} timeZone={user.timezone} />}
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

      <h2 className="mb-3 font-semibold">할 일</h2>
      <TaskView
        tasks={tasks}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        timeZone={user.timezone}
        now={now.toISOString()}
        view="list"
        fixedProjectId={id}
      />

      <h2 className="mt-8 mb-3 font-semibold">관련 노트</h2>
      {notes.length === 0 ? (
        <p className="text-sm text-muted">연결된 노트가 없습니다.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {notes.map((n) => (
            <li key={n.id}>
              <Link
                href={`/knowledge/${n.id}`}
                className="block px-4 py-3 text-sm hover:bg-surface-muted"
              >
                {n.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
