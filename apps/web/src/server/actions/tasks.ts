'use server';

import { localDateToUtc } from '@myos/core';
import {
  createTask,
  deleteTask,
  restoreTask,
  setTaskStatus,
  updateTask,
  type TaskStatus,
} from '@myos/domain';
import { db } from '../db';
import { runAction, str, tagList } from '../action';

const PATHS = ['/tasks', '/dashboard', '/projects'];

type Priority = 'none' | 'low' | 'medium' | 'high';

function taskFields(form: FormData, timeZone: string) {
  const date = str(form, 'date');
  const due = str(form, 'due');
  return {
    title: str(form, 'title') ?? '',
    description: str(form, 'description') ?? null,
    priority: (str(form, 'priority') ?? 'none') as Priority,
    projectId: str(form, 'projectId') ?? null,
    scheduledStart: date ? localDateToUtc(date, timeZone) : null,
    // 마감은 그 날 끝(다음 날 00:00 직전)으로 저장
    dueAt: due ? new Date(localDateToUtc(due, timeZone).getTime() + 86_400_000 - 1) : null,
    tags: tagList(form),
  };
}

export async function createTaskAction(form: FormData) {
  return runAction(async ({ actor, workspace, user }) => {
    const task = await createTask(db, actor, {
      workspaceId: workspace.id,
      ...taskFields(form, user.timezone),
    });
    return { id: task.id };
  }, PATHS);
}

export async function updateTaskAction(taskId: string, form: FormData) {
  return runAction(async ({ actor, user }) => {
    const status = str(form, 'status') as TaskStatus | undefined;
    await updateTask(db, actor, taskId, { ...taskFields(form, user.timezone), status });
  }, PATHS);
}

export async function setTaskStatusAction(taskId: string, status: TaskStatus) {
  return runAction(async ({ actor }) => {
    await setTaskStatus(db, actor, taskId, status);
  }, PATHS);
}

export async function deleteTaskAction(taskId: string) {
  return runAction(async ({ actor }) => deleteTask(db, actor, taskId), PATHS);
}

export async function restoreTaskAction(taskId: string) {
  return runAction(async ({ actor }) => {
    await restoreTask(db, actor, taskId);
  }, PATHS);
}
