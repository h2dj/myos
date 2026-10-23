import { schema } from '@myos/db';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { requireAccess } from './access';
import { recordAudit } from './audit';
import type { Actor, Executor } from './context';
import { NotFoundError, ValidationError } from './errors';
import { isUuid, parse } from './validation';

const { activities, activityPlaces, tasks, taskSeries } = schema;
export type Activity = typeof activities.$inferSelect;
export type ActivityPlace = typeof activityPlaces.$inferSelect;
const fields = {
  name: z.string().trim().min(1, '이름을 입력하세요').max(200),
  description: z.string().max(10_000).nullable().optional(),
};
const placeInput = z.object({ workspaceId: z.uuid(), ...fields });
const activityInput = placeInput.extend({ placeId: z.uuid().nullable().optional() });

export async function listActivities(db: Executor, actor: Actor, workspaceId: string) {
  await requireAccess(db, actor, workspaceId, 'read');
  return db
    .select()
    .from(activities)
    .where(and(eq(activities.workspaceId, workspaceId), isNull(activities.deletedAt)))
    .orderBy(asc(activities.name));
}
export async function listActivityPlaces(db: Executor, actor: Actor, workspaceId: string) {
  await requireAccess(db, actor, workspaceId, 'read');
  return db
    .select()
    .from(activityPlaces)
    .where(and(eq(activityPlaces.workspaceId, workspaceId), isNull(activityPlaces.deletedAt)))
    .orderBy(asc(activityPlaces.name));
}

export async function assertActivityPlaceInWorkspace(
  db: Executor,
  placeId: string,
  workspaceId: string,
) {
  const [place] = await db
    .select()
    .from(activityPlaces)
    .where(
      and(
        eq(activityPlaces.id, placeId),
        eq(activityPlaces.workspaceId, workspaceId),
        isNull(activityPlaces.deletedAt),
      ),
    );
  if (!place) throw new ValidationError('같은 공간의 활동처만 지정할 수 있습니다.');
  return place;
}
export async function assertActivityInWorkspace(
  db: Executor,
  activityId: string,
  workspaceId: string,
) {
  const [activity] = await db
    .select()
    .from(activities)
    .where(
      and(
        eq(activities.id, activityId),
        eq(activities.workspaceId, workspaceId),
        isNull(activities.deletedAt),
      ),
    );
  if (!activity) throw new ValidationError('같은 공간의 사업·활동만 지정할 수 있습니다.');
  return activity;
}

export async function createActivityPlace(
  db: Executor,
  actor: Actor,
  input: z.input<typeof placeInput>,
) {
  const data = parse(placeInput, input);
  return db.transaction(async (tx) => {
    await requireAccess(tx, actor, data.workspaceId, 'write');
    const [place] = await tx
      .insert(activityPlaces)
      .values({ ...data, createdBy: actor.userId })
      .returning();
    await recordAudit(tx, actor, {
      workspaceId: data.workspaceId,
      action: 'activity_place.create',
      entityType: 'activity_place',
      entityId: place!.id,
    });
    return place!;
  });
}
export async function createActivity(
  db: Executor,
  actor: Actor,
  input: z.input<typeof activityInput>,
) {
  const data = parse(activityInput, input);
  return db.transaction(async (tx) => {
    await requireAccess(tx, actor, data.workspaceId, 'write');
    if (data.placeId) await assertActivityPlaceInWorkspace(tx, data.placeId, data.workspaceId);
    const [activity] = await tx
      .insert(activities)
      .values({ ...data, createdBy: actor.userId })
      .returning();
    await recordAudit(tx, actor, {
      workspaceId: data.workspaceId,
      action: 'activity.create',
      entityType: 'activity',
      entityId: activity!.id,
    });
    return activity!;
  });
}

export async function updateActivityPlace(
  db: Executor,
  actor: Actor,
  id: string,
  input: { name?: string; description?: string | null },
) {
  const data = parse(z.object(fields).partial(), input);
  return db.transaction(async (tx) => {
    const current = await loadPlace(tx, id);
    await requireAccess(tx, actor, current.workspaceId, 'write');
    const [place] = await tx
      .update(activityPlaces)
      .set(data)
      .where(eq(activityPlaces.id, id))
      .returning();
    await recordAudit(tx, actor, {
      workspaceId: current.workspaceId,
      action: 'activity_place.update',
      entityType: 'activity_place',
      entityId: id,
    });
    return place!;
  });
}
export async function updateActivity(
  db: Executor,
  actor: Actor,
  id: string,
  input: { name?: string; description?: string | null; placeId?: string | null },
) {
  const data = parse(
    z.object({ ...fields, placeId: z.uuid().nullable().optional() }).partial(),
    input,
  );
  return db.transaction(async (tx) => {
    const current = await loadActivity(tx, id);
    await requireAccess(tx, actor, current.workspaceId, 'write');
    if (data.placeId) await assertActivityPlaceInWorkspace(tx, data.placeId, current.workspaceId);
    const [activity] = await tx
      .update(activities)
      .set(data)
      .where(eq(activities.id, id))
      .returning();
    await recordAudit(tx, actor, {
      workspaceId: current.workspaceId,
      action: 'activity.update',
      entityType: 'activity',
      entityId: id,
    });
    return activity!;
  });
}
export async function deleteActivity(db: Executor, actor: Actor, id: string) {
  return db.transaction(async (tx) => {
    const current = await loadActivity(tx, id);
    await requireAccess(tx, actor, current.workspaceId, 'write');
    await tx.update(activities).set({ deletedAt: new Date() }).where(eq(activities.id, id));
    await tx.update(tasks).set({ activityId: null }).where(eq(tasks.activityId, id));
    await tx.update(taskSeries).set({ activityId: null }).where(eq(taskSeries.activityId, id));
    await recordAudit(tx, actor, {
      workspaceId: current.workspaceId,
      action: 'activity.delete',
      entityType: 'activity',
      entityId: id,
    });
  });
}
export async function deleteActivityPlace(db: Executor, actor: Actor, id: string) {
  return db.transaction(async (tx) => {
    const current = await loadPlace(tx, id);
    await requireAccess(tx, actor, current.workspaceId, 'write');
    await tx.update(activityPlaces).set({ deletedAt: new Date() }).where(eq(activityPlaces.id, id));
    await tx.update(activities).set({ placeId: null }).where(eq(activities.placeId, id));
    await tx.update(tasks).set({ activityPlaceId: null }).where(eq(tasks.activityPlaceId, id));
    await tx
      .update(taskSeries)
      .set({ activityPlaceId: null })
      .where(eq(taskSeries.activityPlaceId, id));
    await recordAudit(tx, actor, {
      workspaceId: current.workspaceId,
      action: 'activity_place.delete',
      entityType: 'activity_place',
      entityId: id,
    });
  });
}
async function loadActivity(db: Executor, id: string) {
  if (!isUuid(id)) throw new NotFoundError('사업·활동');
  const [row] = await db
    .select()
    .from(activities)
    .where(and(eq(activities.id, id), isNull(activities.deletedAt)));
  if (!row) throw new NotFoundError('사업·활동');
  return row;
}
async function loadPlace(db: Executor, id: string) {
  if (!isUuid(id)) throw new NotFoundError('활동처');
  const [row] = await db
    .select()
    .from(activityPlaces)
    .where(and(eq(activityPlaces.id, id), isNull(activityPlaces.deletedAt)));
  if (!row) throw new NotFoundError('활동처');
  return row;
}
