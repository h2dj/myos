import {
  getTask,
  listActivities,
  listActivityPlaces,
  listProjectOptions,
  NotFoundError,
} from '@myos/domain';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { TaskDetail } from '@/components/tasks/task-detail';
import { requireSession } from '@/server/auth/session';
import { db } from '@/server/db';

export const metadata: Metadata = { title: '할 일 상세' };
export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { actor, workspace, user } = await requireSession();
  const task = await getTask(db, actor, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  if (task.workspaceId !== workspace.id) notFound();
  const [projects, activities, places] = await Promise.all([
    listProjectOptions(db, actor, workspace.id),
    listActivities(db, actor, workspace.id),
    listActivityPlaces(db, actor, workspace.id),
  ]);
  return (
    <>
      <Link href="/search" className="text-sm text-muted">
        ← 통합 검색
      </Link>
      <PageHeader title="할 일 상세" description="완료·취소 여부와 관계없이 할 일을 편집합니다." />
      <TaskDetail
        task={task}
        projects={projects}
        activities={activities}
        activityPlaces={places}
        timeZone={user.timezone}
      />
    </>
  );
}
