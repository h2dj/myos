import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createActivity,
  createActivityPlace,
  createProject,
  createTask,
  createRecurringTask,
  deleteTask,
  exportWorkspaceBackup,
  parseWorkspaceBackup,
  sealWorkspaceBackup,
  restoreBackupForVerification,
  backupTableSummary,
  listProjectOptions,
} from '../src';
import { db, newUser, addMember } from './helpers';

async function fixture() {
  const user = await newUser();
  const place = await createActivityPlace(db, user.actor, {
    workspaceId: user.workspaceId,
    name: '복원 활동처',
  });
  const activity = await createActivity(db, user.actor, {
    workspaceId: user.workspaceId,
    name: '상시 활동',
    placeId: place.id,
  });
  const parent = await createProject(db, user.actor, {
    workspaceId: user.workspaceId,
    name: '부모',
  });
  const child = await createProject(db, user.actor, {
    workspaceId: user.workspaceId,
    name: '자식',
    parentId: parent.id,
  });
  const task = await createTask(db, user.actor, {
    workspaceId: user.workspaceId,
    title: '백업 내용',
    projectId: child.id,
    activityId: activity.id,
    activityPlaceId: place.id,
    tags: ['태그'],
  });
  await createRecurringTask(
    db,
    user.actor,
    {
      workspaceId: user.workspaceId,
      title: '반복',
      projectId: child.id,
      rule: { freq: 'daily' },
      startDate: '2026-10-23',
      timezone: 'Asia/Seoul',
    },
    '2026-10-23',
  );
  await deleteTask(db, user.actor, task.id);
  return { ...user, child, parent };
}
function payload(backup: Awaited<ReturnType<typeof exportWorkspaceBackup>>) {
  const { sha256: _sha256, ...data } = backup;
  void _sha256;
  return structuredClone(data);
}

describe('공간 업무 백업', () => {
  it('소유자의 한 공간만 내보내고 삭제된 항목·부모·활동·반복·태그를 보존한다', async () => {
    const user = await fixture();
    const other = await newUser();
    await createTask(db, other.actor, {
      workspaceId: other.workspaceId,
      title: '다른 사람의 비공개 내용',
    });
    const backup = await exportWorkspaceBackup(db, user.actor, user.workspaceId);
    expect(parseWorkspaceBackup(JSON.stringify(backup))).toEqual(backup);
    expect(backup.tables.projects.find((p) => p.id === user.child.id)?.parentId).toBe(
      user.parent.id,
    );
    expect(backup.tables.tasks.some((t) => t.deletedAt !== null)).toBe(true);
    expect(backup.tables.tasks.some((t) => t.seriesId === backup.tables.series[0]?.id)).toBe(true);
    expect(backup.tables.entityTags).toHaveLength(1);
    const text = JSON.stringify(backup);
    expect(text).not.toContain('다른 사람의 비공개 내용');
    expect(text).not.toContain('@test.local');
    expect(Object.keys(backup.tables)).not.toContain('users');
    expect(backupTableSummary(backup.tables)).toMatchObject({
      projects: { count: 2 },
      activities: { count: 1 },
      places: { count: 1 },
    });
  });
  it('다른 사용자·편집자·조회자의 내보내기를 차단한다', async () => {
    const owner = await newUser(),
      viewer = await newUser(),
      editor = await newUser();
    await expect(exportWorkspaceBackup(db, viewer.actor, owner.workspaceId)).rejects.toThrow();
    await addMember(owner.workspaceId, viewer.actor.userId, 'viewer');
    await addMember(owner.workspaceId, editor.actor.userId, 'editor');
    await expect(exportWorkspaceBackup(db, viewer.actor, owner.workspaceId)).rejects.toThrow();
    await expect(exportWorkspaceBackup(db, editor.actor, owner.workspaceId)).rejects.toThrow();
  });
  it('잘린 파일·버전 변경·변조·다른 공간·잘못된 연결·중복·순환을 거부한다', async () => {
    const user = await fixture();
    const backup = await exportWorkspaceBackup(db, user.actor, user.workspaceId);
    expect(() => parseWorkspaceBackup('{')).toThrow('JSON');
    expect(() => parseWorkspaceBackup(JSON.stringify({ ...backup, version: 99 }))).toThrow('형식');
    expect(() =>
      parseWorkspaceBackup(JSON.stringify({ ...backup, sha256: '0'.repeat(64) })),
    ).toThrow('체크섬');
    const foreign = payload(backup);
    foreign.tables.tasks[0]!.workspaceId = '00000000-0000-4000-8000-000000000000';
    expect(() => sealWorkspaceBackup(foreign)).toThrow('다른 공간');
    const dangling = payload(backup);
    dangling.tables.projects[0]!.parentId = '00000000-0000-4000-8000-000000000000';
    expect(() => sealWorkspaceBackup(dangling)).toThrow('연결');
    const duplicate = payload(backup);
    duplicate.tables.tasks.push(duplicate.tables.tasks[0]!);
    expect(() => sealWorkspaceBackup(duplicate)).toThrow('중복');
    const cycle = payload(backup);
    cycle.tables.projects.find((p) => p.id === user.parent.id)!.parentId = user.child.id;
    expect(() => sealWorkspaceBackup(cycle)).toThrow('순환');
    const deep = payload(backup);
    let parentId = user.child.id;
    for (let n = 0; n < 1000; n++) {
      const id = randomUUID();
      deep.tables.projects.push({ ...deep.tables.projects[0]!, id, parentId });
      parentId = id;
    }
    expect(() => sealWorkspaceBackup(deep)).not.toThrow();

    const duplicateOccurrence = payload(backup);
    const occurrence = structuredClone(
      duplicateOccurrence.tables.tasks.find((t) => t.seriesId !== null)!,
    );
    occurrence.id = randomUUID();
    duplicateOccurrence.tables.tasks.push(occurrence);
    expect(() => sealWorkspaceBackup(duplicateOccurrence)).toThrow('회차');
    expect(() => sealWorkspaceBackup({ ...payload(backup), databaseUrl: 'not-accepted' })).toThrow(
      '형식',
    );
  });
  it('일반 개발/운영 이름의 DB에는 복원하지 않는다', async () => {
    const user = await newUser();
    const backup = await exportWorkspaceBackup(db, user.actor, user.workspaceId);
    await expect(restoreBackupForVerification(db, JSON.stringify(backup))).rejects.toThrow(
      '임시 검증 DB',
    );
  });
  it('프로젝트 선택지는 본문·진행률 없이 계층을 유지하고 권한을 검사한다', async () => {
    const user = await fixture();
    const other = await newUser();
    const options = await listProjectOptions(db, user.actor, user.workspaceId);
    expect(options).toHaveLength(2);
    expect(options.find((p) => p.id === user.child.id)?.parentId).toBe(user.parent.id);
    expect(options.every((p) => Object.keys(p).sort().join(',') === 'id,name,parentId')).toBe(true);
    await expect(listProjectOptions(db, other.actor, user.workspaceId)).rejects.toThrow();
  });
});
