import { describe, expect, it } from 'vitest';
import { schema } from '@myos/db';
import { eq } from 'drizzle-orm';
import {
  createActivity,
  createActivityPlace,
  createNote,
  createProject,
  createTask,
  deleteTask,
  deleteProject,
  deleteNote,
  deleteActivity,
  deleteActivityPlace,
  searchWorkspace,
} from '../src';
import { db, newUser } from './helpers';

describe('workspace search', () => {
  it('searches four kinds, literal wildcards, completed content, and excludes trash and other spaces', async () => {
    const { actor, workspaceId } = await newUser();
    const base = { workspaceId, title: '100%_\\ 집중' };
    const task = await createTask(db, actor, { ...base, status: 'done' });
    await createTask(db, actor, { workspaceId, title: '100XX 집중' });
    const removed = await createTask(db, actor, base);
    await deleteTask(db, actor, removed.id);
    await createProject(db, actor, { workspaceId, name: base.title });
    await createActivity(db, actor, { workspaceId, name: base.title });
    await createNote(db, actor, { workspaceId, title: '다른 제목', content: base.title });
    const other = await newUser();
    await createTask(db, other.actor, { ...base, workspaceId: other.workspaceId });
    await createProject(db, other.actor, { workspaceId: other.workspaceId, name: base.title });
    await createActivity(db, other.actor, { workspaceId: other.workspaceId, name: base.title });
    await createNote(db, other.actor, { workspaceId: other.workspaceId, title: base.title });
    const found = await searchWorkspace(db, actor, { workspaceId, query: '100%_\\' });
    expect(found.results.map((r) => r.type).sort()).toEqual([
      'activity',
      'note',
      'project',
      'task',
    ]);
    expect(found.results.find((r) => r.type === 'task')?.id).toBe(task.id);
    await expect(searchWorkspace(db, other.actor, { workspaceId })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('filters descendants and activity/place before pagination and rejects foreign filters', async () => {
    const { actor, workspaceId } = await newUser();
    const root = await createProject(db, actor, { workspaceId, name: '상위' });
    const child = await createProject(db, actor, { workspaceId, name: '하위', parentId: root.id });
    const grandchild = await createProject(db, actor, {
      workspaceId,
      name: '손자',
      parentId: child.id,
    });
    const place = await createActivityPlace(db, actor, { workspaceId, name: '활동처' });
    const activity = await createActivity(db, actor, {
      workspaceId,
      name: '활동',
      placeId: place.id,
    });
    const task = await createTask(db, actor, {
      workspaceId,
      title: '연결',
      projectId: grandchild.id,
      activityId: activity.id,
      activityPlaceId: place.id,
    });
    const filter = { workspaceId, projectId: root.id, type: 'task' as const };
    expect((await searchWorkspace(db, actor, filter)).results.map((r) => r.id)).toEqual([task.id]);
    expect(
      (await searchWorkspace(db, actor, { ...filter, includeChildren: false })).results,
    ).toEqual([]);
    expect(
      (
        await searchWorkspace(db, actor, {
          ...filter,
          activityId: activity.id,
          activityPlaceId: place.id,
        })
      ).results,
    ).toHaveLength(1);
    const other = await newUser();
    const foreign = await createProject(db, other.actor, {
      workspaceId: other.workspaceId,
      name: '비공개',
    });
    await expect(
      searchWorkspace(db, actor, { workspaceId, projectId: foreign.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // Even malformed historical cycles cannot make descendant traversal loop forever.
    await db
      .update(schema.projects)
      .set({ parentId: grandchild.id })
      .where(eq(schema.projects.id, root.id));
    expect((await searchWorkspace(db, actor, filter)).results).toHaveLength(1);
  });

  it('excludes deleted entities and rejects foreign or deleted activity/place filters', async () => {
    const { actor, workspaceId } = await newUser();
    const project = await createProject(db, actor, { workspaceId, name: '삭제 검색' });
    const note = await createNote(db, actor, { workspaceId, title: '삭제 검색' });
    const activity = await createActivity(db, actor, { workspaceId, name: '삭제 검색' });
    const place = await createActivityPlace(db, actor, { workspaceId, name: '삭제 검색' });
    const other = await newUser();
    for (const filter of [{ activityId: activity.id }, { activityPlaceId: place.id }]) {
      await expect(
        searchWorkspace(db, other.actor, { workspaceId: other.workspaceId, ...filter }),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    }
    await deleteProject(db, actor, project.id);
    await deleteNote(db, actor, note.id);
    await deleteActivity(db, actor, activity.id);
    await deleteActivityPlace(db, actor, place.id);
    expect((await searchWorkspace(db, actor, { workspaceId, query: '삭제 검색' })).results).toEqual(
      [],
    );
    for (const filter of [
      { projectId: project.id },
      { activityId: activity.id },
      { activityPlaceId: place.id },
    ]) {
      await expect(searchWorkspace(db, actor, { workspaceId, ...filter })).rejects.toMatchObject({
        code: 'projectId' in filter ? 'NOT_FOUND' : 'VALIDATION',
      });
    }
  });

  it('paginates all matching rows with deterministic ties', async () => {
    const { actor, workspaceId } = await newUser();
    await db.insert(schema.tasks).values(
      Array.from({ length: 25 }, (_, i) => ({
        workspaceId,
        createdBy: actor.userId,
        title: `검색 ${i}`,
        updatedAt: new Date('2026-01-01'),
      })),
    );
    const first = await searchWorkspace(db, actor, { workspaceId, query: '검색' });
    const second = await searchWorkspace(db, actor, { workspaceId, query: '검색', page: 2 });
    expect(first.results).toHaveLength(20);
    expect(first.hasMore).toBe(true);
    expect(second.results).toHaveLength(5);
    expect(second.hasMore).toBe(false);
    expect(new Set([...first.results, ...second.results].map((r) => r.id)).size).toBe(25);
  });
});
