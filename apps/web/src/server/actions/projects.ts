'use server';

import { localDateToUtc } from '@myos/core';
import { createProject, deleteProject, updateProject, type ProjectStatus } from '@myos/domain';
import { db } from '../db';
import { runAction, str } from '../action';

const PATHS = ['/projects', '/tasks', '/dashboard'];

function fields(form: FormData, timeZone: string) {
  const start = str(form, 'startAt');
  const due = str(form, 'dueAt');
  return {
    name: str(form, 'name') ?? '',
    parentId: str(form, 'parentId') ?? null,
    description: str(form, 'description') ?? null,
    status: (str(form, 'status') ?? 'active') as ProjectStatus,
    startAt: start ? localDateToUtc(start, timeZone) : null,
    dueAt: due ? localDateToUtc(due, timeZone) : null,
  };
}

export async function createProjectAction(form: FormData) {
  return runAction(async ({ actor, workspace, user }) => {
    const p = await createProject(db, actor, {
      workspaceId: workspace.id,
      ...fields(form, user.timezone),
    });
    return { id: p.id, name: p.name, parentId: p.parentId };
  }, PATHS);
}

export async function updateProjectAction(projectId: string, form: FormData) {
  return runAction(async ({ actor, user }) => {
    await updateProject(db, actor, projectId, fields(form, user.timezone));
  }, PATHS);
}

export async function deleteProjectAction(projectId: string) {
  return runAction(async ({ actor }) => deleteProject(db, actor, projectId), PATHS);
}
