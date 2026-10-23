import { randomUUID } from 'node:crypto';
import { schema, type Db } from '@myos/db';
import {
  ensureUserProfile,
  createProject,
  createActivity,
  createActivityPlace,
  createTask,
  createNote,
  createRecurringTask,
  captureInbox,
  convertInboxToTask,
  deleteTask,
} from '../src';

export async function seedRehearsal(db: Db) {
  const userId = randomUUID();
  const actor = { userId };
  const { personalWorkspaceId: workspaceId } = await ensureUserProfile(db, {
    id: userId,
    email: `${userId}@fixture.invalid`,
    name: '검증용 사용자',
  });
  const place = await createActivityPlace(db, actor, { workspaceId, name: '검증 활동처' });
  const activity = await createActivity(db, actor, {
    workspaceId,
    name: '검증 활동',
    placeId: place.id,
  });
  const parent = await createProject(db, actor, { workspaceId, name: '상위 프로젝트' });
  const child = await createProject(db, actor, {
    workspaceId,
    name: '하위 프로젝트',
    parentId: parent.id,
  });
  const grandchild = await createProject(db, actor, {
    workspaceId,
    name: '세부 프로젝트',
    parentId: child.id,
  });
  const linked = { projectId: grandchild.id, activityId: activity.id, activityPlaceId: place.id };
  await createTask(db, actor, {
    workspaceId,
    title: '검증 할 일',
    ...linked,
    tags: ['업무', '검증'],
  });
  const trash = await createTask(db, actor, { workspaceId, title: '휴지통 항목', ...linked });
  await deleteTask(db, actor, trash.id);
  await createNote(db, actor, {
    workspaceId,
    title: '검증 노트',
    content: '본문',
    projectId: child.id,
    tags: ['검증'],
  });
  await createRecurringTask(
    db,
    actor,
    {
      workspaceId,
      title: '반복 할 일',
      ...linked,
      rule: { freq: 'daily' },
      timezone: 'Asia/Seoul',
      startDate: '2026-10-22',
      tags: ['반복'],
    },
    '2026-10-23',
  );
  const inbox = await captureInbox(db, actor, { workspaceId, content: '연결된 인박스\n설명' });
  await convertInboxToTask(db, actor, inbox.id);
  await captureInbox(db, actor, { workspaceId, content: '미처리 인박스' });
  // 처리 내역과 메모 연결도 검증한다.
  const [note] = await db.select({ id: schema.notes.id }).from(schema.notes);
  const [task] = await db.select({ id: schema.tasks.id }).from(schema.tasks);
  await db.insert(schema.entityLinks).values({
    workspaceId,
    sourceType: 'note',
    sourceId: note!.id,
    targetType: 'task',
    targetId: task!.id,
  });
  return { actor, workspaceId, projectId: child.id };
}
