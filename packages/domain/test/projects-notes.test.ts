import { describe, expect, it } from 'vitest';
import {
  countNotesByType,
  createNote,
  createProject,
  createTask,
  deleteNote,
  getProject,
  listNotes,
  listProjects,
  restoreNote,
  setTaskStatus,
  updateProject,
} from '../src';
import { db, newUser } from './helpers';

describe('프로젝트 (PROJ-01)', () => {
  it('진행률은 취소를 제외한 완료 비율', async () => {
    const { actor, workspaceId } = await newUser();
    const project = await createProject(db, actor, { workspaceId, name: '웹사이트 리뉴얼' });
    const tasks = await Promise.all(
      ['a', 'b', 'c', 'd'].map((title) =>
        createTask(db, actor, { workspaceId, title, projectId: project.id }),
      ),
    );
    await setTaskStatus(db, actor, tasks[0]!.id, 'done');
    await setTaskStatus(db, actor, tasks[1]!.id, 'done');
    await setTaskStatus(db, actor, tasks[2]!.id, 'cancelled');

    const p = await getProject(db, actor, project.id);
    expect(p).toMatchObject({ taskTotal: 3, taskDone: 2, progress: 67 });

    await updateProject(db, actor, project.id, { status: 'completed' });
    expect(await listProjects(db, actor, { workspaceId, status: ['active'] })).toHaveLength(0);
    expect(await listProjects(db, actor, { workspaceId, status: ['completed'] })).toHaveLength(1);
  });
});

describe('노트 (NOTE-01)', () => {
  it('태그·프로젝트 연결·검색·휴지통', async () => {
    const { actor, workspaceId } = await newUser();
    const project = await createProject(db, actor, { workspaceId, name: '마케팅' });
    const idea = await createNote(db, actor, {
      workspaceId,
      title: '제품 아이디어 모음',
      content: '생산성을 높이는 기능',
      type: 'idea',
      tags: ['아이디어', '제품'],
      projectId: project.id,
    });
    await createNote(db, actor, { workspaceId, title: '독서 노트', content: '100% 집중' });

    expect((await listNotes(db, actor, { workspaceId, tag: '제품' })).map((n) => n.id)).toEqual([
      idea.id,
    ]);
    expect(await listNotes(db, actor, { workspaceId, query: '생산성' })).toHaveLength(1);
    // LIKE 와일드카드는 문자 그대로 검색된다
    expect(await listNotes(db, actor, { workspaceId, query: '%' })).toHaveLength(1);
    expect(await listNotes(db, actor, { workspaceId, projectId: project.id })).toHaveLength(1);
    expect(await countNotesByType(db, actor, workspaceId)).toMatchObject({
      all: 2,
      idea: 1,
      note: 1,
    });

    await deleteNote(db, actor, idea.id);
    expect(await listNotes(db, actor, { workspaceId })).toHaveLength(1);
    await restoreNote(db, actor, idea.id);
    expect(await listNotes(db, actor, { workspaceId })).toHaveLength(2);
  });
});
