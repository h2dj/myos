import { describe, expect, it } from 'vitest';
import {
  createProject,
  updateProject,
  getProject,
  deleteProject,
  createTask,
  getTask,
  listTasks,
  createActivity,
  createActivityPlace,
  listActivities,
  listActivityPlaces,
  updateActivity,
  updateActivityPlace,
  deleteActivity,
  deleteActivityPlace,
  runTaskQuickAction,
  createRecurringTask,
  generateSeriesOccurrences,
} from '../src';
import { db, newUser, addMember } from './helpers';

describe('프로젝트 계층', () => {
  it('다단계 중첩을 저장하고 자기 자신·하위·다른 공간의 부모를 거부한다', async () => {
    const { actor, workspaceId } = await newUser();
    const a = await createProject(db, actor, { workspaceId, name: '상위' });
    const b = await createProject(db, actor, { workspaceId, name: '하위', parentId: a.id });
    const c = await createProject(db, actor, { workspaceId, name: '손자', parentId: b.id });
    expect((await getProject(db, actor, c.id)).parentId).toBe(b.id);
    await expect(updateProject(db, actor, a.id, { parentId: a.id })).rejects.toThrow('자기 자신');
    await expect(updateProject(db, actor, a.id, { parentId: c.id })).rejects.toThrow('하위');
    const other = await newUser();
    await expect(
      createProject(db, other.actor, {
        workspaceId: other.workspaceId,
        name: '잘못된 연결',
        parentId: a.id,
      }),
    ).rejects.toThrow('같은 공간');
    await deleteProject(db, actor, b.id);
    expect((await getProject(db, actor, c.id)).parentId).toBeNull();
    await expect(updateProject(db, actor, c.id, { parentId: b.id })).rejects.toThrow('같은 공간');
  });
  it('동시에 서로를 부모로 지정해도 순환이 생기지 않는다', async () => {
    const { actor, workspaceId } = await newUser();
    const a = await createProject(db, actor, { workspaceId, name: 'A' });
    const b = await createProject(db, actor, { workspaceId, name: 'B' });
    const results = await Promise.allSettled([
      updateProject(db, actor, a.id, { parentId: b.id }),
      updateProject(db, actor, b.id, { parentId: a.id }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
});

describe('상시 사업·활동과 활동처', () => {
  it('프로젝트와 함께 연결하고 편집·복사·반복 회차에서도 유지한다', async () => {
    const { actor, workspaceId } = await newUser();
    const place = await createActivityPlace(db, actor, { workspaceId, name: '공동체IT' });
    const activity = await createActivity(db, actor, {
      workspaceId,
      name: '상시 운영',
      placeId: place.id,
    });
    const project = await createProject(db, actor, { workspaceId, name: '웹 개편' });
    await updateActivityPlace(db, actor, place.id, { description: '단체' });
    await updateActivity(db, actor, activity.id, { description: '기한 없음' });
    expect(await listActivityPlaces(db, actor, workspaceId)).toHaveLength(1);
    expect(await listActivities(db, actor, workspaceId)).toHaveLength(1);
    const task = await createTask(db, actor, {
      workspaceId,
      title: '동시에 연결',
      projectId: project.id,
      activityId: activity.id,
      activityPlaceId: place.id,
    });
    expect(await getTask(db, actor, task.id)).toMatchObject({
      projectName: '웹 개편',
      activityName: '상시 운영',
      activityPlaceName: '공동체IT',
    });
    const copy = await runTaskQuickAction(db, actor, task.id, 'copyTomorrow', 'Asia/Seoul');
    expect(copy).toMatchObject({ activityId: activity.id, activityPlaceId: place.id });
    const { series } = await createRecurringTask(
      db,
      actor,
      {
        workspaceId,
        title: '반복',
        activityId: activity.id,
        activityPlaceId: place.id,
        rule: { freq: 'daily' },
        startDate: '2026-10-23',
        timezone: 'Asia/Seoul',
      },
      '2026-10-23',
    );
    await generateSeriesOccurrences(db, series.id, '2026-10-24');
    expect(
      (await listTasks(db, actor, { workspaceId })).filter((t) => t.seriesId === series.id),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ activityId: activity.id, activityPlaceId: place.id }),
      ]),
    );
    await deleteActivityPlace(db, actor, place.id);
    expect((await getTask(db, actor, task.id)).activityPlaceId).toBeNull();
    expect((await listActivities(db, actor, workspaceId))[0]!.placeId).toBeNull();
    await deleteActivity(db, actor, activity.id);
    expect((await getTask(db, actor, task.id)).activityId).toBeNull();
    await generateSeriesOccurrences(db, series.id, '2026-10-25');
    const tasks = await listTasks(db, actor, { workspaceId });
    expect(
      tasks
        .filter((t) => t.seriesId === series.id)
        .every((t) => t.activityId === null && t.activityPlaceId === null),
    ).toBe(true);
    await expect(
      createTask(db, actor, { workspaceId, title: '삭제된 활동', activityId: activity.id }),
    ).rejects.toThrow('같은 공간');
  });
  it('다른 공간 연결과 조회·수정을 거부하고 조회자는 쓸 수 없다', async () => {
    const owner = await newUser();
    const other = await newUser();
    const place = await createActivityPlace(db, owner.actor, {
      workspaceId: owner.workspaceId,
      name: '비공개 활동처',
    });
    const activity = await createActivity(db, owner.actor, {
      workspaceId: owner.workspaceId,
      name: '비공개 활동',
      placeId: place.id,
    });
    await expect(
      createActivity(db, other.actor, {
        workspaceId: other.workspaceId,
        name: '불가',
        placeId: place.id,
      }),
    ).rejects.toThrow('같은 공간');
    await expect(
      createTask(db, other.actor, {
        workspaceId: other.workspaceId,
        title: '불가',
        activityId: activity.id,
      }),
    ).rejects.toThrow('같은 공간');
    await expect(
      createTask(db, other.actor, {
        workspaceId: other.workspaceId,
        title: '불가',
        activityPlaceId: place.id,
      }),
    ).rejects.toThrow('같은 공간');
    await expect(listActivities(db, other.actor, owner.workspaceId)).rejects.toThrow();
    await expect(updateActivity(db, other.actor, activity.id, { name: '변경' })).rejects.toThrow();
    await expect(deleteActivityPlace(db, other.actor, place.id)).rejects.toThrow();
    await addMember(owner.workspaceId, other.actor.userId, 'viewer');
    expect(await listActivityPlaces(db, other.actor, owner.workspaceId)).toHaveLength(1);
    await expect(
      createActivityPlace(db, other.actor, { workspaceId: owner.workspaceId, name: '금지' }),
    ).rejects.toThrow();
    await expect(deleteActivity(db, other.actor, activity.id)).rejects.toThrow();
  });
});
