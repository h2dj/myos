import { describe, expect, it } from 'vitest';
import {
  createProject,
  createTask,
  deleteTask,
  getTask,
  listTasks,
  restoreTask,
  setTaskStatus,
  updateTask,
} from '../src';
import { db, newUser } from './helpers';

describe('할 일 (TASK-01)', () => {
  it('캘린더는 겹치는 예정 기간과 별도 마감일을 조회하고 삭제·다른 공간을 제외한다', async () => {
    const { actor, workspaceId } = await newUser();
    await createTask(db, actor, {
      workspaceId,
      title: '다일',
      scheduledStart: new Date('2026-03-01Z'),
      scheduledEnd: new Date('2026-04-03Z'),
    });
    await createTask(db, actor, {
      workspaceId,
      title: '별도 마감',
      scheduledStart: new Date('2026-02-01Z'),
      dueAt: new Date('2026-04-02Z'),
    });
    await createTask(db, actor, { workspaceId, title: '경계 밖', dueAt: new Date('2026-04-08Z') });
    const deleted = await createTask(db, actor, {
      workspaceId,
      title: '삭제',
      dueAt: new Date('2026-04-02Z'),
    });
    await deleteTask(db, actor, deleted.id);
    const other = await newUser();
    await createTask(db, other.actor, {
      workspaceId: other.workspaceId,
      title: '다른 공간',
      dueAt: new Date('2026-04-02Z'),
    });
    const rows = await listTasks(db, actor, {
      workspaceId,
      calendar: true,
      from: new Date('2026-04-01Z'),
      to: new Date('2026-04-08Z'),
    });
    expect(rows.map((t) => t.title).sort()).toEqual(['다일', '별도 마감']);
  });

  it('생성·수정·완료·삭제·복구', async () => {
    const { actor, workspaceId } = await newUser();
    const task = await createTask(db, actor, {
      workspaceId,
      title: '기획서 초안 작성',
      priority: 'high',
      tags: ['업무', '업무', '기획'],
    });
    expect(task.status).toBe('todo');

    const fetched = await getTask(db, actor, task.id);
    expect(fetched.tags.map((t) => t.name)).toEqual(['기획', '업무']);

    await updateTask(db, actor, task.id, { title: '기획서 최종본', tags: ['업무'] });
    const done = await setTaskStatus(db, actor, task.id, 'done');
    expect(done.completedAt).toBeInstanceOf(Date);
    const reopened = await setTaskStatus(db, actor, task.id, 'todo');
    expect(reopened.completedAt).toBeNull();

    await deleteTask(db, actor, task.id);
    expect(await listTasks(db, actor, { workspaceId })).toHaveLength(0);
    const trash = await listTasks(db, actor, { workspaceId, trash: true });
    expect(trash.map((t) => t.id)).toEqual([task.id]);
    await expect(getTask(db, actor, task.id)).rejects.toThrow('찾을 수 없습니다');

    await restoreTask(db, actor, task.id);
    const restored = await getTask(db, actor, task.id);
    expect(restored).toMatchObject({ title: '기획서 최종본', deletedAt: null });
    expect(restored.tags.map((t) => t.name)).toEqual(['업무']);
  });

  it('기간 필터는 예정일, 없으면 마감일 기준', async () => {
    const { actor, workspaceId } = await newUser();
    await createTask(db, actor, {
      workspaceId,
      title: 'A',
      scheduledStart: new Date('2026-04-22T00:00:00Z'),
    });
    await createTask(db, actor, {
      workspaceId,
      title: 'B',
      dueAt: new Date('2026-04-23T00:00:00Z'),
    });
    await createTask(db, actor, {
      workspaceId,
      title: 'C',
      dueAt: new Date('2026-05-23T00:00:00Z'),
    });
    await createTask(db, actor, { workspaceId, title: '날짜 없음' });
    const inRange = await listTasks(db, actor, {
      workspaceId,
      from: new Date('2026-04-21T00:00:00Z'),
      to: new Date('2026-04-30T00:00:00Z'),
    });
    expect(inRange.map((t) => t.title)).toEqual(['A', 'B']);
  });

  it('완료된 일은 completedSince 이후 것만 남는다', async () => {
    const { actor, workspaceId } = await newUser();
    const t = await createTask(db, actor, { workspaceId, title: '오래전 완료' });
    await setTaskStatus(db, actor, t.id, 'done');
    await createTask(db, actor, { workspaceId, title: '진행 중' });
    const list = await listTasks(db, actor, {
      workspaceId,
      completedSince: new Date(Date.now() + 60_000),
    });
    expect(list.map((x) => x.title)).toEqual(['진행 중']);
  });

  it('예정 종료가 시작보다 빠르면 거부', async () => {
    const { actor, workspaceId } = await newUser();
    await expect(
      createTask(db, actor, {
        workspaceId,
        title: 'x',
        scheduledStart: new Date('2026-04-22'),
        scheduledEnd: new Date('2026-04-21'),
      }),
    ).rejects.toThrow('종료일');
  });

  it('다른 공간의 프로젝트에는 연결할 수 없다', async () => {
    const a = await newUser('a');
    const b = await newUser('b');
    const bProject = await createProject(db, b.actor, { workspaceId: b.workspaceId, name: 'B' });
    await expect(
      createTask(db, a.actor, { workspaceId: a.workspaceId, title: 'x', projectId: bProject.id }),
    ).rejects.toThrow('같은 공간');
  });
});
