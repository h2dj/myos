import { describe, expect, it } from 'vitest';
import { localDateToUtc } from '@myos/core';
import { createTask, getTask, listTasks, runTaskQuickAction, type TaskQuickAction } from '../src';
import { db, newUser } from './helpers';

const tz = 'Asia/Seoul';
// UTC에서는 아직 21일이지만 서울은 22일이다.
const now = new Date('2026-04-21T16:00:00Z');
const past = localDateToUtc('2026-04-20', tz);
const tomorrow = localDateToUtc('2026-04-23', tz);

describe('할 일 빠른 작업', () => {
  it('내일로: 날짜와 기간을 옮기고 원본의 내용은 유지한다', async () => {
    const { actor, workspaceId } = await newUser();
    const task = await createTask(db, actor, {
      workspaceId,
      title: '이동',
      scheduledStart: past,
      scheduledEnd: new Date(past.getTime() + 3_600_000),
      dueAt: new Date(past.getTime() + 86_400_000),
      tags: ['업무'],
    });
    const moved = await runTaskQuickAction(db, actor, task.id, 'tomorrow', tz, now);
    expect(moved.id).toBe(task.id);
    expect(moved.scheduledStart).toEqual(tomorrow);
    expect(moved.scheduledEnd).toEqual(new Date(tomorrow.getTime() + 3_600_000));
    expect(moved.dueAt).toEqual(new Date(tomorrow.getTime() + 86_400_000));
    expect((await getTask(db, actor, task.id)).tags.map((t) => t.name)).toEqual(['업무']);
  });

  it('내일도: 완료된 원본과 태그를 보존하고 미완료 복사본을 만든다', async () => {
    const { actor, workspaceId } = await newUser();
    const task = await createTask(db, actor, {
      workspaceId,
      title: '복사',
      description: '메모',
      priority: 'high',
      status: 'done',
      scheduledStart: past,
      tags: ['업무'],
    });
    const copy = await runTaskQuickAction(db, actor, task.id, 'copyTomorrow', tz, now);
    expect(copy.id).not.toBe(task.id);
    expect(copy).toMatchObject({
      title: task.title,
      description: '메모',
      priority: 'high',
      status: 'todo',
      completedAt: null,
      seriesId: null,
      scheduledStart: tomorrow,
    });
    expect((await getTask(db, actor, copy.id)).tags.map((t) => t.name)).toEqual(['업무']);
    expect(await getTask(db, actor, task.id)).toMatchObject({
      status: 'done',
      scheduledStart: past,
      completedAt: task.completedAt,
    });
  });

  it('날짜가 없거나 마감일만 있는 할 일도 내일로 보낸다', async () => {
    const { actor, workspaceId } = await newUser();
    const noDate = await createTask(db, actor, { workspaceId, title: '날짜 없음' });
    expect(
      (await runTaskQuickAction(db, actor, noDate.id, 'tomorrow', tz, now)).scheduledStart,
    ).toEqual(tomorrow);
    const dueOnly = await createTask(db, actor, { workspaceId, title: '마감만', dueAt: past });
    const moved = await runTaskQuickAction(db, actor, dueOnly.id, 'tomorrow', tz, now);
    expect(moved.scheduledStart).toBeNull();
    expect(moved.dueAt).toEqual(tomorrow);
  });

  it('완료처리: 예정일(없으면 마감일)에 완료하고 오늘 목록에서는 제외한다', async () => {
    const { actor, workspaceId } = await newUser();
    for (const dates of [{ scheduledStart: past }, { dueAt: past }]) {
      const task = await createTask(db, actor, { workspaceId, title: '지난 할 일', ...dates });
      const done = await runTaskQuickAction(db, actor, task.id, 'completeOnDate', tz, now);
      expect(done).toMatchObject({ status: 'done', completedAt: past });
    }
    expect(
      await listTasks(db, actor, { workspaceId, completedSince: localDateToUtc('2026-04-22', tz) }),
    ).toHaveLength(0);
  });

  it('완료처리는 오늘·미래·날짜 없음·이미 완료된 항목을 거부한다', async () => {
    const { actor, workspaceId } = await newUser();
    for (const fields of [
      {},
      { scheduledStart: localDateToUtc('2026-04-22', tz) },
      { scheduledStart: tomorrow },
      { scheduledStart: past, status: 'done' as const },
      { scheduledStart: past, status: 'cancelled' as const },
    ]) {
      const task = await createTask(db, actor, { workspaceId, title: '거부', ...fields });
      await expect(
        runTaskQuickAction(db, actor, task.id, 'completeOnDate', tz, now),
      ).rejects.toThrow('지난 날짜');
    }
  });

  it('모든 빠른 작업은 다른 사용자의 할 일 접근을 거부한다', async () => {
    const owner = await newUser();
    const other = await newUser();
    const task = await createTask(db, owner.actor, {
      workspaceId: owner.workspaceId,
      title: '비공개',
      scheduledStart: past,
    });
    for (const action of ['tomorrow', 'copyTomorrow', 'completeOnDate'] as TaskQuickAction[]) {
      await expect(runTaskQuickAction(db, other.actor, task.id, action, tz, now)).rejects.toThrow();
    }
    expect((await getTask(db, owner.actor, task.id)).status).toBe('todo');
  });
});
