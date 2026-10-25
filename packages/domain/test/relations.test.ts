import { describe, expect, it } from 'vitest';
import { schema } from '@myos/db';
import { and, eq } from 'drizzle-orm';
import {
  addRelatedItem,
  createActivity,
  createActivityPlace,
  createNote,
  createProject,
  createTask,
  createTaskFromNote,
  deleteActivity,
  getRelatedItems,
  purgeExpired,
  removeRelatedItem,
  searchRelationTargets,
} from '../src';
import { db, newUser, addMember } from './helpers';

async function fixture() {
  const user = await newUser();
  const project = await createProject(db, user.actor, {
    workspaceId: user.workspaceId,
    name: '관련 프로젝트',
  });
  const activity = await createActivity(db, user.actor, {
    workspaceId: user.workspaceId,
    name: '관련 활동',
  });
  const otherActivity = await createActivity(db, user.actor, {
    workspaceId: user.workspaceId,
    name: '협업 활동',
  });
  const place = await createActivityPlace(db, user.actor, {
    workspaceId: user.workspaceId,
    name: '관련 활동처',
  });
  const note = await createNote(db, user.actor, {
    workspaceId: user.workspaceId,
    title: '연결할 아이디어',
    type: 'idea',
  });
  const task = await createTask(db, user.actor, {
    workspaceId: user.workspaceId,
    title: '관련 할 일',
  });
  return { ...user, project, activity, otherActivity, place, note, task };
}

describe('업무 항목 관계', () => {
  it('활동끼리·활동/프로젝트·지식과 네 종류의 대상을 양쪽에서 확인한다', async () => {
    const f = await fixture();
    const a = { type: 'activity', id: f.activity.id };
    await addRelatedItem(db, f.actor, a, { type: 'activity', id: f.otherActivity.id });
    await addRelatedItem(db, f.actor, a, { type: 'project', id: f.project.id });
    const note = { type: 'note', id: f.note.id };
    for (const target of [
      { type: 'project', id: f.project.id },
      a,
      { type: 'place', id: f.place.id },
      { type: 'task', id: f.task.id },
    ]) {
      await addRelatedItem(db, f.actor, note, target);
      expect(
        (await getRelatedItems(db, f.actor, target)).links.some(
          (link) => link.item.id === f.note.id,
        ),
      ).toBe(true);
    }
    expect((await getRelatedItems(db, f.actor, note)).links).toHaveLength(4);
    expect((await getRelatedItems(db, f.actor, a)).links).toHaveLength(3);
    expect(
      (await getRelatedItems(db, f.actor, { type: 'project', id: f.project.id })).links
        .map((link) => link.item.type)
        .sort(),
    ).toEqual(['activity', 'note']);
  });
  it('역방향 동시 추가도 하나만 저장하고 연결 해제는 원본을 남긴다', async () => {
    const f = await fixture();
    const a = { type: 'activity', id: f.activity.id },
      b = { type: 'activity', id: f.otherActivity.id };
    const [first, second] = await Promise.all([
      addRelatedItem(db, f.actor, a, b),
      addRelatedItem(db, f.actor, b, a),
    ]);
    expect(first.id).toBe(second.id);
    expect((await getRelatedItems(db, f.actor, a)).links).toHaveLength(1);
    await removeRelatedItem(db, f.actor, b, first.id);
    expect((await getRelatedItems(db, f.actor, a)).links).toHaveLength(0);
    expect((await getRelatedItems(db, f.actor, b)).source.title).toBe('협업 활동');
  });
  it('기존 기본 프로젝트·파생 연결을 중복 추가하지 않으며 보존한다', async () => {
    const f = await fixture();
    const primary = await createNote(db, f.actor, {
      workspaceId: f.workspaceId,
      title: '프로젝트 노트',
      projectId: f.project.id,
    });
    const source = { type: 'note', id: primary.id };
    const link = await addRelatedItem(db, f.actor, source, { type: 'project', id: f.project.id });
    expect(link.id).toBe(`primary:${primary.id}`);
    expect((await getRelatedItems(db, f.actor, source)).links[0]).toMatchObject({
      kind: 'primary',
      removable: false,
    });
    const task = await createTaskFromNote(db, f.actor, f.note.id, { title: '파생 할 일' });
    const derived = await addRelatedItem(
      db,
      f.actor,
      { type: 'note', id: f.note.id },
      { type: 'task', id: task.id },
    );
    expect(
      (await getRelatedItems(db, f.actor, { type: 'note', id: f.note.id })).links[0],
    ).toMatchObject({ id: derived.id, kind: 'derived_from', removable: false });
    await expect(
      removeRelatedItem(db, f.actor, { type: 'note', id: f.note.id }, derived.id),
    ).rejects.toThrow();
  });
  it('자기 연결·지원하지 않는 연결·공간 간 연결·삭제 항목을 차단한다', async () => {
    const f = await fixture(),
      other = await fixture();
    const a = { type: 'activity', id: f.activity.id };
    await expect(addRelatedItem(db, f.actor, a, a)).rejects.toThrow('자기 자신');
    await expect(addRelatedItem(db, f.actor, a, { type: 'task', id: f.task.id })).rejects.toThrow();
    await expect(
      addRelatedItem(db, f.actor, a, { type: 'project', id: other.project.id }),
    ).rejects.toThrow('같은 공간');
    await deleteActivity(db, f.actor, f.otherActivity.id);
    await expect(
      addRelatedItem(db, f.actor, a, { type: 'activity', id: f.otherActivity.id }),
    ).rejects.toThrow();
    await expect(getRelatedItems(db, other.actor, a)).rejects.toThrow();
  });
  it('조회자는 읽기만 가능하고 편집자는 연결·해제하며 검색은 같은 공간만 반환한다', async () => {
    const f = await fixture(),
      viewer = await newUser(),
      editor = await newUser(),
      outsider = await fixture();
    await addMember(f.workspaceId, viewer.actor.userId, 'viewer');
    await addMember(f.workspaceId, editor.actor.userId, 'editor');
    const a = { type: 'activity', id: f.activity.id },
      p = { type: 'project', id: f.project.id };
    const link = await addRelatedItem(db, editor.actor, a, p);
    const read = await getRelatedItems(db, viewer.actor, a);
    expect(read.canWrite).toBe(false);
    expect(read.links[0]!.removable).toBe(false);
    await expect(
      addRelatedItem(db, viewer.actor, a, { type: 'note', id: f.note.id }),
    ).rejects.toThrow();
    await expect(removeRelatedItem(db, viewer.actor, a, link.id)).rejects.toThrow();
    const search = await searchRelationTargets(db, viewer.actor, a, {
      type: 'project',
      query: '관련',
      page: 1,
    });
    expect(search.results.map((item) => item.id)).toEqual([f.project.id]);
    expect(search.results.some((item) => item.id === outsider.project.id)).toBe(false);
    await removeRelatedItem(db, editor.actor, p, link.id);
  });
  it('연결 삭제된 활동은 숨기고 영구 정리 때 연결·태그도 정리한다', async () => {
    const f = await fixture();
    const source = { type: 'note', id: f.note.id };
    await addRelatedItem(db, f.actor, source, { type: 'activity', id: f.activity.id });
    await deleteActivity(db, f.actor, f.activity.id);
    expect((await getRelatedItems(db, f.actor, source)).links).toHaveLength(0);
    await db
      .update(schema.activities)
      .set({ deletedAt: new Date('2000-01-01Z') })
      .where(eq(schema.activities.id, f.activity.id));
    await purgeExpired(db, new Date('2000-03-01Z'));
    const links = await db
      .select()
      .from(schema.entityLinks)
      .where(
        and(
          eq(schema.entityLinks.workspaceId, f.workspaceId),
          eq(schema.entityLinks.targetId, f.activity.id),
        ),
      );
    const sourceLinks = await db
      .select()
      .from(schema.entityLinks)
      .where(
        and(
          eq(schema.entityLinks.workspaceId, f.workspaceId),
          eq(schema.entityLinks.sourceId, f.activity.id),
        ),
      );
    expect([...links, ...sourceLinks]).toHaveLength(0);
  });
});
