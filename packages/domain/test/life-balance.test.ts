import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { LIFE_FRAMEWORKS, type LifeBalanceInput } from '@myos/core';
import { schema } from '@myos/db';
import { eq } from 'drizzle-orm';
import {
  createActivity,
  createTask,
  deleteTask,
  updateTask,
  updateProfile,
  previewLifeBalance,
  saveLifeBalance,
  listLifeReviews,
  deleteLifeReview,
  exportWorkspaceBackup,
  parseWorkspaceBackup,
  sealWorkspaceBackup,
} from '../src';
import { db, newUser, addMember, newSharedWorkspace } from './helpers';

function input(): LifeBalanceInput {
  return {
    framework: 'wheel',
    from: '2026-03-08',
    to: '2026-03-08',
    selfWeight: 70,
    reflection: '소중한 가치',
    nextAction: '짧게 산책하기',
    areas: LIFE_FRAMEWORKS.wheel.areas.map((a) => ({
      id: a.id,
      selfScore: 6,
      target: 2,
      tag: a.id,
      activityIds: [],
    })),
  };
}
async function completed(
  actor: { userId: string },
  workspaceId: string,
  at: string,
  tags = ['health'],
  activityId?: string,
) {
  const task = await createTask(db, actor, {
    workspaceId,
    title: '완료 활동',
    status: 'done',
    tags,
    activityId,
  });
  await db
    .update(schema.tasks)
    .set({ completedAt: new Date(at) })
    .where(eq(schema.tasks.id, task.id));
  return task;
}

describe('개인 삶의 균형 회고', () => {
  it('기존 회고도 당시 활동 건수로 자기평가만 반영하며 원본·백업은 보존한다', async () => {
    const user = await newUser();
    const saved = await saveLifeBalance(db, user.actor, input(), randomUUID());
    const legacy = structuredClone(
      saved.snapshot,
    ) as unknown as import('@myos/core').LifeBalanceSnapshot;
    legacy.version = 1;
    legacy.activityScore = 0;
    legacy.combined = 4.2;
    legacy.areas = legacy.areas.map((area) => ({ ...area, activityScore: 0, combined: 4.2 }));
    await db
      .update(schema.lifeReviews)
      .set({ snapshot: legacy as unknown as Record<string, unknown> })
      .where(eq(schema.lifeReviews.id, saved.id));
    await completed(user.actor, user.workspaceId, '2026-03-08T03:00Z');
    const [review] = await listLifeReviews(db, user.actor);
    expect(review!.snapshot).toMatchObject({
      version: 2,
      combined: 6,
      activityScore: null,
      totalCompleted: 0,
    });
    expect(review!.snapshot.areas.every((a) => a.combined === 6 && a.activityScore === null)).toBe(
      true,
    );
    const backup = await exportWorkspaceBackup(db, user.actor, user.workspaceId);
    expect(backup.tables.lifeReviews![0]!.snapshot).toMatchObject({ version: 1, combined: 4.2 });
    expect(parseWorkspaceBackup(JSON.stringify(backup))).toEqual(backup);
  });

  it('사용자 시간대의 완료일을 DST 포함해 반열린 구간으로 집계하고 완료·삭제·공간을 구분한다', async () => {
    const user = await newUser();
    await updateProfile(db, user.actor, { name: 'reviewer', timezone: 'America/New_York' });
    await completed(user.actor, user.workspaceId, '2026-03-08T05:00:00Z');
    await completed(user.actor, user.workspaceId, '2026-03-09T03:59:59Z');
    await completed(user.actor, user.workspaceId, '2026-03-09T04:00:00Z');
    await completed(user.actor, user.workspaceId, '2026-03-08T04:59:59Z');
    await createTask(db, user.actor, {
      workspaceId: user.workspaceId,
      title: '예정만 있음',
      scheduledStart: new Date('2026-03-08T06:00Z'),
      tags: ['health'],
    });
    const deleted = await completed(user.actor, user.workspaceId, '2026-03-08T12:00Z');
    await deleteTask(db, user.actor, deleted.id);
    const shared = await newSharedWorkspace(user.actor.userId);
    await completed(user.actor, shared, '2026-03-08T12:00Z');
    const result = await previewLifeBalance(db, user.actor, input());
    expect(result.snapshot.totalCompleted).toBe(2);
    expect(result.snapshot.areas[0]).toMatchObject({
      completed: 2,
      activityScore: 10,
      combined: 7.2,
    });
  });
  it('활동 연결·태그의 중복 집계와 영역 간 충돌을 처리한다', async () => {
    const user = await newUser();
    const activity = await createActivity(db, user.actor, {
      workspaceId: user.workspaceId,
      name: '운동',
    });
    const data = input();
    data.areas[0]!.activityIds = [activity.id];
    await completed(user.actor, user.workspaceId, '2026-03-08T03:00Z', ['health'], activity.id);
    await completed(user.actor, user.workspaceId, '2026-03-08T03:00Z', ['work'], activity.id);
    await completed(user.actor, user.workspaceId, '2026-03-08T03:00Z', []);
    const result = await previewLifeBalance(db, user.actor, data);
    expect(result.snapshot).toMatchObject({ totalCompleted: 3, unclassified: 2, conflicts: 1 });
    expect(result.snapshot.areas[0]!.completed).toBe(1);
    expect(result.evidence.map((e) => e.areaId)).toContain('conflict');
  });
  it('자기평가 누락·잘못된 날짜·목표·비중·위조된 집계 입력을 거부한다', async () => {
    const user = await newUser();
    const data = input();
    for (const raw of [
      { ...data, from: '2026-02-30' },
      { ...data, from: '2025-01-01' },
      { ...data, selfWeight: 101 },
      { ...data, combined: 10 },
      { ...data, to: '2099-01-01' },
    ]) {
      await expect(previewLifeBalance(db, user.actor, raw)).rejects.toThrow();
    }
    data.areas[0]!.target = 0;
    await expect(previewLifeBalance(db, user.actor, data)).rejects.toThrow();
    data.areas[0]!.target = 1;
    await expect(
      previewLifeBalance(db, user.actor, {
        ...data,
        areas: data.areas.map((a, i) => (i ? a : { ...a, selfScore: null })),
      }),
    ).rejects.toThrow();
    data.areas[1]!.tag = data.areas[0]!.tag;
    await expect(previewLifeBalance(db, user.actor, data)).rejects.toThrow('같은 태그');
  });
  it('저장 때 재집계하며 저장한 값은 이후 활동 수정에도 유지하고 요청 재시도는 중복 생성하지 않는다', async () => {
    const user = await newUser();
    const data = input();
    await previewLifeBalance(db, user.actor, data);
    const task = await completed(user.actor, user.workspaceId, '2026-03-08T03:00Z');
    const id = randomUUID();
    const saved = await saveLifeBalance(db, user.actor, data, id);
    await updateTask(db, user.actor, task.id, { status: 'todo' });
    await saveLifeBalance(db, user.actor, data, id);
    const history = await listLifeReviews(db, user.actor);
    expect(history).toHaveLength(1);
    expect(history[0]!.snapshot.areas[0]!.completed).toBe(1);
    expect(saved.id).toBe(id);
    await deleteLifeReview(db, user.actor, id);
    expect(await listLifeReviews(db, user.actor)).toHaveLength(0);
  });
  it('다른 사용자·활동·공간 멤버에게 개인 회고를 공개하지 않는다', async () => {
    const user = await newUser(),
      other = await newUser();
    const saved = await saveLifeBalance(db, user.actor, input(), randomUUID());
    await addMember(user.workspaceId, other.actor.userId, 'editor');
    expect(await listLifeReviews(db, other.actor)).toHaveLength(0);
    await expect(deleteLifeReview(db, other.actor, saved.id)).rejects.toThrow();
    const foreign = await createActivity(db, other.actor, {
      workspaceId: other.workspaceId,
      name: '다른 사용자 활동',
    });
    const data = input();
    data.areas[0]!.activityIds = [foreign.id];
    await expect(previewLifeBalance(db, user.actor, data)).rejects.toThrow('개인 공간');
  });
  it('백업 v3는 회고를 보존하고 v1/v2는 계속 지원하며 다른 소유자의 회고는 거부한다', async () => {
    const user = await newUser(),
      other = await newUser();
    await saveLifeBalance(db, user.actor, input(), randomUUID());
    await saveLifeBalance(
      db,
      other.actor,
      { ...input(), reflection: '다른 사용자의 비밀' },
      randomUUID(),
    );
    const backup = await exportWorkspaceBackup(db, user.actor, user.workspaceId);
    expect(backup.version).toBe(6);
    expect(backup.tables.lifeReviews).toHaveLength(1);
    expect(JSON.stringify(backup)).not.toContain('다른 사용자의 비밀');
    expect(parseWorkspaceBackup(JSON.stringify(backup))).toEqual(backup);
    const { sha256: _sha256, ...payload } = backup;
    void _sha256;
    const legacy = structuredClone(payload);
    delete legacy.tables.financePlans;
    delete legacy.tables.financePlanOutcomes;
    delete legacy.tables.financeComments;
    delete legacy.tables.financeAccounts;
    delete legacy.tables.financeEntries;
    delete legacy.tables.financeBudgets;
    expect(sealWorkspaceBackup({ ...legacy, version: 3 }).version).toBe(3);
    delete legacy.tables.lifeReviews;
    expect(sealWorkspaceBackup({ ...legacy, version: 2 }).version).toBe(2);
    delete legacy.tables.externalRefs;
    expect(sealWorkspaceBackup({ ...legacy, version: 1 }).version).toBe(1);
    const wrong = structuredClone(payload);
    wrong.tables.lifeReviews![0]!.userId = other.actor.userId;
    expect(() => sealWorkspaceBackup(wrong)).toThrow('소유자');
  });
});
