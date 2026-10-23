'use server';
import {
  createActivity,
  createActivityPlace,
  updateActivity,
  updateActivityPlace,
  deleteActivity,
  deleteActivityPlace,
} from '@myos/domain';
import { db } from '../db';
import { runAction, str } from '../action';
const PATHS = ['/activities', '/tasks', '/projects', '/dashboard'];
export async function saveActivityAction(id: string | null, form: FormData) {
  return runAction(async ({ actor, workspace }) => {
    const data = {
      name: str(form, 'name') ?? '',
      description: str(form, 'description') ?? null,
      placeId: str(form, 'placeId') ?? null,
    };
    const row = id
      ? await updateActivity(db, actor, id, data)
      : await createActivity(db, actor, { workspaceId: workspace.id, ...data });
    return { id: row.id };
  }, PATHS);
}
export async function saveActivityPlaceAction(id: string | null, form: FormData) {
  return runAction(async ({ actor, workspace }) => {
    const data = { name: str(form, 'name') ?? '', description: str(form, 'description') ?? null };
    const row = id
      ? await updateActivityPlace(db, actor, id, data)
      : await createActivityPlace(db, actor, { workspaceId: workspace.id, ...data });
    return { id: row.id };
  }, PATHS);
}
export async function deleteActivityAction(id: string) {
  return runAction(({ actor }) => deleteActivity(db, actor, id), PATHS);
}
export async function deleteActivityPlaceAction(id: string) {
  return runAction(({ actor }) => deleteActivityPlace(db, actor, id), PATHS);
}
