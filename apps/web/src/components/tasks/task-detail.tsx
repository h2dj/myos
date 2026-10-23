'use client';

import type { Activity, ActivityPlace, ProjectWithProgress, TaskWithTags } from '@myos/domain';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { TaskForm } from './task-form';

export function TaskDetail({
  task,
  projects,
  activities,
  activityPlaces,
  timeZone,
}: {
  task: TaskWithTags;
  projects: Pick<ProjectWithProgress, 'id' | 'name' | 'parentId'>[];
  activities: Activity[];
  activityPlaces: ActivityPlace[];
  timeZone: string;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  return (
    <div className="max-w-2xl">
      {saved && (
        <p role="status" className="mb-4">
          저장했습니다.
        </p>
      )}
      <TaskForm
        key={task.updatedAt.toString()}
        task={task}
        projects={projects}
        activities={activities}
        activityPlaces={activityPlaces}
        timeZone={timeZone}
        onCancel={() => router.push('/search')}
        onDone={() => {
          setSaved(true);
          router.refresh();
        }}
      />
    </div>
  );
}
