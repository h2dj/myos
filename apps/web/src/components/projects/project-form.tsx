'use client';

import { PROJECT_STATUS_LABEL } from '@/lib/labels';
import { projectPath, utcToLocalDate } from '@myos/core';
import type { Project } from '@myos/domain';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createProjectAction, updateProjectAction } from '@/server/actions/projects';
import { Button } from '../ui/button';
import { Field, Input, Select, Textarea } from '../ui/field';
import { FormMessage } from '../ui/form-message';

export function ProjectForm({
  project,
  timeZone,
  onDone,
  projects = [],
}: {
  project?: Project;
  projects?: Pick<Project, 'id' | 'name' | 'parentId'>[];
  timeZone: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const local = (d: Date | null | undefined) => (d ? utcToLocalDate(new Date(d), timeZone) : '');

  return (
    <form
      action={(form) =>
        startTransition(async () => {
          if (project) {
            const res = await updateProjectAction(project.id, form);
            if (!res.ok) return setError(res.error);
            onDone();
          } else {
            const res = await createProjectAction(form);
            if (!res.ok) return setError(res.error);
            onDone();
            router.push(`/projects/${res.data.id}`);
          }
        })
      }
      className="space-y-4"
    >
      <FormMessage error={error} />
      <Field label="이름">
        <Input name="name" required defaultValue={project?.name} autoFocus maxLength={200} />
      </Field>
      <Field label="상위 프로젝트">
        <Select name="parentId" defaultValue={project?.parentId ?? ''}>
          <option value="">없음 (최상위)</option>
          {projects
            .filter((p) => p.id !== project?.id)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {projectPath(p, projects)}
              </option>
            ))}
        </Select>
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="상태">
          <Select name="status" defaultValue={project?.status ?? 'active'}>
            {Object.entries(PROJECT_STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="시작일">
          <Input name="startAt" type="date" defaultValue={local(project?.startAt)} />
        </Field>
        <Field label="마감일">
          <Input name="dueAt" type="date" defaultValue={local(project?.dueAt)} />
        </Field>
      </div>
      <Field label="설명">
        <Textarea name="description" rows={3} defaultValue={project?.description ?? ''} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          취소
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? '저장 중…' : '저장'}
        </Button>
      </div>
    </form>
  );
}
