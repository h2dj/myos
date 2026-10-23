'use client';

import type { Project } from '@myos/domain';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deleteProjectAction } from '@/server/actions/projects';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { ProjectForm } from './project-form';

export function NewProjectButton({
  timeZone,
  projects = [],
}: {
  timeZone: string;
  projects?: Project[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> 프로젝트 추가
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="프로젝트 추가">
        <ProjectForm projects={projects} timeZone={timeZone} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

export function EditProjectButtons({
  project,
  timeZone,
  projects = [],
}: {
  project: Project;
  timeZone: string;
  projects?: Project[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Pencil className="size-4" /> 편집
      </Button>
      <Button
        variant="danger"
        disabled={pending}
        onClick={() => {
          if (
            !confirm(
              '프로젝트를 휴지통으로 옮길까요? 소속 할 일은 남고 하위 프로젝트는 최상위로 이동합니다.',
            )
          )
            return;
          startTransition(async () => {
            const res = await deleteProjectAction(project.id);
            if (res.ok) router.push('/projects');
          });
        }}
      >
        <Trash2 className="size-4" /> 삭제
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="프로젝트 편집">
        <ProjectForm
          projects={projects}
          project={project}
          timeZone={timeZone}
          onDone={() => setOpen(false)}
        />
      </Dialog>
    </>
  );
}
