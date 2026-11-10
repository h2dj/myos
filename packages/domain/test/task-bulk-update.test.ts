import { describe, expect, it } from 'vitest';
import {
  bulkUpdateTasks,
  createActivity,
  createActivityPlace,
  createProject,
  createTask,
  deleteTask,
  getTask,
} from '../src';
import { db, newUser } from './helpers';

describe('할 일 일괄 속성 지정', () => {
  it('여러 할 일에 프로젝트·사업·활동처·상태를 한 번에 지정하고 지정하지 않은 속성은 그대로 둔다', async () => {
    const { actor, workspaceId } = await newUser();
    const project = await createProject(db, actor, { workspaceId, name: '기획' });
    const place = await createActivityPlace(db, actor, { workspaceId, name: '센터' });
    const activity = await createActivity(db, actor, {
      workspaceId,
      name: '상시 상담',
      placeId: place.id,
    });
    const a = await createTask(db, actor, { workspaceId, title: 'A', priority: 'high' });
    const b = await createTask(db, actor, { workspaceId, title: 'B', priority: 'low' });
    const c = await createTask(db, actor, { workspaceId, title: '그대로' });

    const res = await bulkUpdateTasks(db, actor, {
      workspaceId,
      taskIds: [a.id, b.id, a.id],
      patch: {
        projectId: project.id,
        activityId: activity.id,
        activityPlaceId: place.id,
        status: 'done',
      },
    });
    expect(res.updated).toBe(2);
    for (const id of [a.id, b.id]) {
      const t = await getTask(db, actor, id);
      expect(t.projectId).toBe(project.id);
      expect(t.activityId).toBe(activity.id);
      expect(t.activityPlaceId).toBe(place.id);
      expect(t.status).toBe('done');
      expect(t.completedAt).not.toBeNull();
    }
    expect((await getTask(db, actor, a.id)).priority).toBe('high');
    expect((await getTask(db, actor, b.id)).priority).toBe('low');
    expect((await getTask(db, actor, c.id)).projectId).toBeNull();

    // null은 비운다, 완료를 되돌리면 완료 시각도 지운다
    await bulkUpdateTasks(db, actor, {
      workspaceId,
      taskIds: [a.id],
      patch: { projectId: null, status: 'todo' },
    });
    const cleared = await getTask(db, actor, a.id);
    expect(cleared.projectId).toBeNull();
    expect(cleared.activityId).toBe(activity.id);
    expect(cleared.completedAt).toBeNull();
  });

  it('다른 공간·삭제된 할 일이 섞이면 전부 취소하고, 바꿀 속성이 없으면 거부한다', async () => {
    const { actor, workspaceId } = await newUser();
    const other = await newUser();
    const mine = await createTask(db, actor, { workspaceId, title: '내 것' });
    const theirs = await createTask(db, other.actor, {
      workspaceId: other.workspaceId,
      title: '남의 것',
    });
    await expect(
      bulkUpdateTasks(db, actor, {
        workspaceId,
        taskIds: [mine.id, theirs.id],
        patch: { priority: 'high' },
      }),
    ).rejects.toThrow();
    expect((await getTask(db, actor, mine.id)).priority).toBe('none');

    const gone = await createTask(db, actor, { workspaceId, title: '삭제' });
    await deleteTask(db, actor, gone.id);
    await expect(
      bulkUpdateTasks(db, actor, {
        workspaceId,
        taskIds: [mine.id, gone.id],
        patch: { priority: 'high' },
      }),
    ).rejects.toThrow();

    await expect(
      bulkUpdateTasks(db, actor, { workspaceId, taskIds: [mine.id], patch: {} }),
    ).rejects.toThrow('바꿀 속성');

    // 다른 공간의 프로젝트는 지정할 수 없다
    const foreign = await createProject(db, other.actor, {
      workspaceId: other.workspaceId,
      name: '남의 프로젝트',
    });
    await expect(
      bulkUpdateTasks(db, actor, {
        workspaceId,
        taskIds: [mine.id],
        patch: { projectId: foreign.id },
      }),
    ).rejects.toThrow();
  });
});
