import { describe, expect, it } from 'vitest';
import {
  createActivity,
  createActivityPlace,
  createProject,
  createSequenceTask,
  createTask,
  deleteTask,
  getRelatedItems,
  getTask,
  getTaskSequence,
  sequenceTaskTitle,
} from '../src';
import { addMember, db, newUser } from './helpers';

async function fixture() {
  const user = await newUser();
  const place = await createActivityPlace(db, user.actor, {
    workspaceId: user.workspaceId,
    name: '도서관',
  });
  const activity = await createActivity(db, user.actor, {
    workspaceId: user.workspaceId,
    name: '독서 모임',
    placeId: place.id,
  });
  const project = await createProject(db, user.actor, {
    workspaceId: user.workspaceId,
    name: '가을 행사',
  });
  const task = await createTask(db, user.actor, {
    workspaceId: user.workspaceId,
    title: '포스터 만들기',
    priority: 'high',
    status: 'in_progress',
    projectId: project.id,
    activityId: activity.id,
    activityPlaceId: place.id,
    tags: ['디자인'],
  });
  return { ...user, place, activity, project, task };
}

describe('이전·후속 작업', () => {
  it('프로젝트·상시 사업/활동을 공유하고 제목에 (이전)/(후속)을 붙인다', async () => {
    const f = await fixture();
    const before = await createSequenceTask(db, f.actor, f.task.id, 'before');
    const after = await createSequenceTask(db, f.actor, f.task.id, 'after');
    expect(before.title).toBe('포스터 만들기 (이전)');
    expect(after.title).toBe('포스터 만들기 (후속)');
    for (const created of [before, after]) {
      expect(created).toMatchObject({
        workspaceId: f.workspaceId,
        projectId: f.project.id,
        activityId: f.activity.id,
        activityPlaceId: f.place.id,
        status: 'todo',
        priority: 'none',
      });
      expect((await getTask(db, f.actor, created.id)).tags).toEqual([]);
    }

    const sequence = await getTaskSequence(db, f.actor, f.task.id);
    expect(sequence.canWrite).toBe(true);
    expect(sequence.previous.map((t) => t.id)).toEqual([before.id]);
    expect(sequence.next.map((t) => t.id)).toEqual([after.id]);
    // 반대쪽에서도 관계가 보인다
    expect((await getTaskSequence(db, f.actor, before.id)).next.map((t) => t.id)).toEqual([
      f.task.id,
    ]);
    expect((await getTaskSequence(db, f.actor, after.id)).previous.map((t) => t.id)).toEqual([
      f.task.id,
    ]);
    // 선후 관계는 관련 항목 목록에 섞이지 않는다
    expect((await getRelatedItems(db, f.actor, { type: 'task', id: f.task.id })).links).toEqual([]);
  });

  it('프로젝트·활동이 없는 할 일도 만들 수 있고 휴지통의 작업은 목록에서 빠진다', async () => {
    const { actor, workspaceId } = await newUser();
    const task = await createTask(db, actor, { workspaceId, title: '단독' });
    const next = await createSequenceTask(db, actor, task.id, 'after');
    expect(next).toMatchObject({ projectId: null, activityId: null, activityPlaceId: null });
    await deleteTask(db, actor, next.id);
    expect((await getTaskSequence(db, actor, task.id)).next).toEqual([]);
  });

  it('긴 제목은 줄여서 300자 안에 맞춘다', () => {
    const title = sequenceTaskTitle('가'.repeat(300), 'after');
    expect(title).toHaveLength(300);
    expect(title.endsWith(' (후속)')).toBe(true);
  });

  it('조회 권한으로는 목록만 보고 작업을 만들 수 없다', async () => {
    const f = await fixture();
    const viewer = await newUser();
    await addMember(f.workspaceId, viewer.actor.userId, 'viewer');
    expect((await getTaskSequence(db, viewer.actor, f.task.id)).canWrite).toBe(false);
    await expect(createSequenceTask(db, viewer.actor, f.task.id, 'after')).rejects.toThrow();
    const outsider = await newUser();
    await expect(getTaskSequence(db, outsider.actor, f.task.id)).rejects.toThrow();
  });
});
