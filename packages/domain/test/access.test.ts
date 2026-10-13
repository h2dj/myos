import { describe, expect, it } from 'vitest';
import {
  captureInbox,
  createNote,
  createTask,
  deleteTask,
  getNote,
  getTask,
  listNotes,
  listProjects,
  listTasks,
  updateTask,
} from '../src';
import { addMember, db, newSharedWorkspace, newUser } from './helpers';

describe('공간 권한 격리 (WS-01, 인수 테스트 #6)', () => {
  it('다른 사용자의 개인 공간 데이터에 접근할 수 없다', async () => {
    const owner = await newUser('owner');
    const other = await newUser('other');
    const task = await createTask(db, owner.actor, {
      workspaceId: owner.workspaceId,
      title: '비밀',
    });
    const note = await createNote(db, owner.actor, {
      workspaceId: owner.workspaceId,
      title: '메모',
    });

    await expect(listTasks(db, other.actor, { workspaceId: owner.workspaceId })).rejects.toThrow(
      '찾을 수 없습니다',
    );
    await expect(getTask(db, other.actor, task.id)).rejects.toThrow('찾을 수 없습니다');
    await expect(updateTask(db, other.actor, task.id, { title: 'hack' })).rejects.toThrow(
      '찾을 수 없습니다',
    );
    await expect(getNote(db, other.actor, note.id)).rejects.toThrow('찾을 수 없습니다');
    await expect(listNotes(db, other.actor, { workspaceId: owner.workspaceId })).rejects.toThrow();
    await expect(
      listProjects(db, other.actor, { workspaceId: owner.workspaceId }),
    ).rejects.toThrow();
    await expect(
      captureInbox(db, other.actor, { workspaceId: owner.workspaceId, content: 'x' }),
    ).rejects.toThrow();
  });

  it('공유 공간 멤버라도 소유자의 개인 공간은 볼 수 없다', async () => {
    const owner = await newUser('owner');
    const editor = await newUser('editor');
    const shared = await newSharedWorkspace(owner.actor.userId);
    await addMember(shared, editor.actor.userId, 'editor');
    await createTask(db, owner.actor, { workspaceId: owner.workspaceId, title: '개인' });

    await expect(listTasks(db, editor.actor, { workspaceId: owner.workspaceId })).rejects.toThrow();
    const sharedTask = await createTask(db, editor.actor, {
      workspaceId: shared,
      title: '공유 업무',
    });
    expect((await listTasks(db, owner.actor, { workspaceId: shared })).map((t) => t.id)).toEqual([
      sharedTask.id,
    ]);
  });

  it('조회자는 읽기만 가능하다', async () => {
    const owner = await newUser('owner');
    const viewer = await newUser('viewer');
    const shared = await newSharedWorkspace(owner.actor.userId);
    await addMember(shared, viewer.actor.userId, 'viewer');
    const task = await createTask(db, owner.actor, { workspaceId: shared, title: '공유 업무' });

    expect(await listTasks(db, viewer.actor, { workspaceId: shared })).toHaveLength(1);
    await expect(createTask(db, viewer.actor, { workspaceId: shared, title: 'x' })).rejects.toThrow(
      '권한',
    );
    await expect(updateTask(db, viewer.actor, task.id, { title: 'x' })).rejects.toThrow('권한');
    await expect(deleteTask(db, viewer.actor, task.id)).rejects.toThrow('권한');
  });
});
