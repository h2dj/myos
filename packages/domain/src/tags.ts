import { schema } from '@myos/db';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Actor, Executor } from './context';
import { requireAccess } from './access';

const { tags, entityTags } = schema;

export type EntityType = (typeof schema.entityType.enumValues)[number];
export interface TagRef {
  id: string;
  name: string;
  color: string;
}

export const tagNamesSchema = z
  .array(z.string().trim().min(1).max(30))
  .max(20)
  .transform((names) => [...new Set(names)]);

/** 항목의 태그를 이름 목록으로 통째로 교체한다. 없는 태그는 공간에 새로 만든다. */
export async function replaceEntityTags(
  db: Executor,
  workspaceId: string,
  entityType: EntityType,
  entityId: string,
  names: string[],
) {
  await db
    .delete(entityTags)
    .where(and(eq(entityTags.entityType, entityType), eq(entityTags.entityId, entityId)));
  if (names.length === 0) return;

  await db
    .insert(tags)
    .values(names.map((name) => ({ workspaceId, name })))
    .onConflictDoNothing({ target: [tags.workspaceId, tags.name] });
  const rows = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.workspaceId, workspaceId), inArray(tags.name, names)));
  await db
    .insert(entityTags)
    .values(rows.map((t) => ({ tagId: t.id, entityType, entityId })))
    .onConflictDoNothing();
}

/** 여러 항목의 태그를 한 번에 조회한다. */
export async function tagsFor(
  db: Executor,
  entityType: EntityType,
  entityIds: string[],
): Promise<Map<string, TagRef[]>> {
  const result = new Map<string, TagRef[]>();
  if (entityIds.length === 0) return result;
  const rows = await db
    .select({ entityId: entityTags.entityId, id: tags.id, name: tags.name, color: tags.color })
    .from(entityTags)
    .innerJoin(tags, eq(tags.id, entityTags.tagId))
    .where(and(eq(entityTags.entityType, entityType), inArray(entityTags.entityId, entityIds)))
    .orderBy(asc(tags.name));
  for (const { entityId, ...tag } of rows) {
    const list = result.get(entityId) ?? [];
    list.push(tag);
    result.set(entityId, list);
  }
  return result;
}

export async function listTags(db: Executor, actor: Actor, workspaceId: string) {
  await requireAccess(db, actor, workspaceId, 'read');
  return db.select().from(tags).where(eq(tags.workspaceId, workspaceId)).orderBy(asc(tags.name));
}
