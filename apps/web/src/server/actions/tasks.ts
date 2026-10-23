'use server';

import { localDateToUtc, utcToLocalDate, type RecurrenceRule } from '@myos/core';
import {
  createRecurringTask,
  createTask,
  stopSeries,
  deleteTask,
  restoreTask,
  setTaskStatus,
  updateTask,
  runTaskQuickAction,
  type TaskQuickAction,
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
    activityId: str(form, 'activityId') ?? null,
    activityPlaceId: str(form, 'activityPlaceId') ?? null,
    scheduledStart: date ? localDateToUtc(date, timeZone) : null,
    // 마감은 그 날 끝(다음 날 00:00 직전)으로 저장
    dueAt: due ? new Date(localDateToUtc(due, timeZone).getTime() + 86_400_000 - 1) : null,
    tags: tagList(form),
  };
}

/** 반복 선택값 → 규칙. 매주·매월은 시작일의 요일·날짜를 따른다 */
function recurrenceFrom(form: FormData, startDate: string): RecurrenceRule | null {
  const d = new Date(`${startDate}T12:00:00Z`);
  switch (str(form, 'repeat')) {
    case 'daily':
      return { freq: 'daily' };
    case 'weekdays':
      return { freq: 'weekly', byWeekday: [1, 2, 3, 4, 5] };
    case 'weekly':
      return { freq: 'weekly', byWeekday: [d.getUTCDay()] };
    case 'monthly':
      return { freq: 'monthly', byMonthDay: d.getUTCDate() };
    default:
      return null;
  }
}

export async function createTaskAction(form: FormData) {
  return runAction(async ({ actor, workspace, user }) => {
    const today = utcToLocalDate(new Date(), user.timezone);
    const startDate = str(form, 'date') ?? today;
    const rule = recurrenceFrom(form, startDate);
    const fields = taskFields(form, user.timezone);
    if (rule) {
      const { created } = await createRecurringTask(
        db,
        actor,
        {
          workspaceId: workspace.id,
          title: fields.title,
          description: fields.description,
          projectId: fields.projectId,
          activityId: fields.activityId,
          activityPlaceId: fields.activityPlaceId,
          priority: fields.priority,
          tags: fields.tags,
          rule,
          timezone: user.timezone,
          startDate,
        },
        today,
      );
      return { id: created[0] ?? null };
    }
    const task = await createTask(db, actor, { workspaceId: workspace.id, ...fields });
    return { id: task.id };
  }, PATHS);
}

export async function stopSeriesAction(seriesId: string) {
  return runAction(async ({ actor }) => stopSeries(db, actor, seriesId), PATHS);
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

export async function taskQuickAction(taskId: string, action: TaskQuickAction) {
  return runAction(async ({ actor, user }) => {
    await runTaskQuickAction(db, actor, taskId, action, user.timezone);
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
