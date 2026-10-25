import {
  can,
  canonicalRelation,
  RELATION_TARGETS,
  relationHref,
  type RelationKind,
  type RelationRef,
} from '@myos/core';
import { schema } from '@myos/db';
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { requireAccess } from './access';
import { recordAudit } from './audit';
import type { Actor, Executor } from './context';
import { NotFoundError, ValidationError } from './errors';
import { isUuid, parse } from './validation';

const refSchema = z
  .object({ type: z.enum(['project', 'activity', 'place', 'task', 'note']), id: z.uuid() })
  .strict();
const entities = {
  project: { table: schema.projects, title: schema.projects.name },
  activity: { table: schema.activities, title: schema.activities.name },
  place: { table: schema.activityPlaces, title: schema.activityPlaces.name },
  task: { table: schema.tasks, title: schema.tasks.title },
  note: { table: schema.notes, title: schema.notes.title },
};
export interface RelationItem extends RelationRef {
  title: string;
  workspaceId: string;
  href: string;
}
export interface RelatedItem {
  id: string;
  item: RelationItem;
  kind: 'related' | 'derived_from' | 'primary';
  removable: boolean;
}

async function loadItem(db: Executor, raw: unknown): Promise<RelationItem> {
  const ref = parse(refSchema, raw);
  const { table, title } = entities[ref.type];
  const [row] = await db
    .select({ id: table.id, title, workspaceId: table.workspaceId })
    .from(table)
    .where(and(eq(table.id, ref.id), isNull(table.deletedAt)));
  if (!row) throw new NotFoundError('연결할 항목');
  return { ...row, type: ref.type, href: relationHref(ref) };
}
const touches = (ref: RelationRef) =>
  or(
    and(eq(schema.entityLinks.sourceType, ref.type), eq(schema.entityLinks.sourceId, ref.id)),
    and(eq(schema.entityLinks.targetType, ref.type), eq(schema.entityLinks.targetId, ref.id)),
  );

export async function getRelatedItems(db: Executor, actor: Actor, raw: unknown) {
  const source = await loadItem(db, raw);
  const role = await requireAccess(db, actor, source.workspaceId, 'read');
  const rows = await db
    .select()
    .from(schema.entityLinks)
    .where(and(eq(schema.entityLinks.workspaceId, source.workspaceId), touches(source)))
    .orderBy(desc(schema.entityLinks.createdAt), asc(schema.entityLinks.id));
  const refs = rows.map((row) =>
    row.sourceType === source.type && row.sourceId === source.id
      ? { type: row.targetType, id: row.targetId }
      : { type: row.sourceType, id: row.sourceId },
  );
  const primaryNotes =
    source.type === 'project'
      ? await db
          .select({
            id: schema.notes.id,
            title: schema.notes.title,
            workspaceId: schema.notes.workspaceId,
          })
          .from(schema.notes)
          .where(
            and(
              eq(schema.notes.workspaceId, source.workspaceId),
              eq(schema.notes.projectId, source.id),
              isNull(schema.notes.deletedAt),
            ),
          )
      : [];
  const primaryProject =
    source.type === 'note'
      ? await db
          .select({ projectId: schema.notes.projectId })
          .from(schema.notes)
          .where(eq(schema.notes.id, source.id))
      : [];
  if (primaryProject[0]?.projectId) refs.push({ type: 'project', id: primaryProject[0].projectId });
  const targets = new Map<string, RelationItem>();
  for (const type of Object.keys(entities) as RelationKind[]) {
    const ids = refs.filter((ref) => ref.type === type).map((ref) => ref.id);
    if (!ids.length) continue;
    const { table, title } = entities[type];
    const live = await db
      .select({ id: table.id, title, workspaceId: table.workspaceId })
      .from(table)
      .where(
        and(
          eq(table.workspaceId, source.workspaceId),
          isNull(table.deletedAt),
          inArray(table.id, ids),
        ),
      );
    for (const row of live)
      targets.set(`${type}:${row.id}`, { ...row, type, href: relationHref({ type, id: row.id }) });
  }
  const result = new Map<string, RelatedItem>();
  for (const note of primaryNotes)
    result.set(`note:${note.id}`, {
      id: `primary:${note.id}`,
      item: { ...note, type: 'note', href: relationHref({ type: 'note', id: note.id }) },
      kind: 'primary',
      removable: false,
    });
  if (primaryProject[0]?.projectId) {
    const project = targets.get(`project:${primaryProject[0].projectId}`);
    if (project)
      result.set(`project:${project.id}`, {
        id: `primary:${source.id}`,
        item: project,
        kind: 'primary',
        removable: false,
      });
  }
  rows.forEach((row, index) => {
    const ref = refs[index]!;
    const key = `${ref.type}:${ref.id}`;
    const item = targets.get(key);
    if (item && !result.has(key))
      result.set(key, {
        id: row.id,
        item,
        kind: row.linkType,
        removable: row.linkType === 'related' && can(role, 'write'),
      });
  });
  return { source, canWrite: can(role, 'write'), links: [...result.values()] };
}

export async function searchRelationTargets(
  db: Executor,
  actor: Actor,
  sourceRaw: unknown,
  raw: unknown,
) {
  const source = await loadItem(db, sourceRaw);
  await requireAccess(db, actor, source.workspaceId, 'read');
  const input = parse(
    z
      .object({
        type: refSchema.shape.type,
        query: z.string().trim().max(200),
        page: z.number().int().min(1).max(5000),
      })
      .strict(),
    raw,
  );
  if (!RELATION_TARGETS[source.type].includes(input.type))
    throw new ValidationError('이 항목에 연결할 수 없는 유형입니다.');
  const { table, title } = entities[input.type];
  const pattern = `%${input.query.replace(/[\\%_]/g, '\\$&')}%`;
  const rows = await db
    .select({ id: table.id, title, workspaceId: table.workspaceId })
    .from(table)
    .where(
      and(
        eq(table.workspaceId, source.workspaceId),
        isNull(table.deletedAt),
        ilike(title, pattern),
        source.type === input.type ? sql`${table.id} <> ${source.id}::uuid` : undefined,
      ),
    )
    .orderBy(asc(title), asc(table.id))
    .limit(21)
    .offset((input.page - 1) * 20);
  return {
    results: rows.slice(0, 20).map((row) => ({
      ...row,
      type: input.type,
      href: relationHref({ type: input.type, id: row.id }),
    })),
    hasMore: rows.length > 20,
  };
}

export async function addRelatedItem(
  db: Executor,
  actor: Actor,
  sourceRaw: unknown,
  targetRaw: unknown,
) {
  const sourceRef = parse(refSchema, sourceRaw),
    targetRef = parse(refSchema, targetRaw);
  if (
    !RELATION_TARGETS[sourceRef.type].includes(targetRef.type) ||
    (sourceRef.type === targetRef.type && sourceRef.id === targetRef.id)
  )
    throw new ValidationError('자기 자신 또는 지원하지 않는 항목은 연결할 수 없습니다.');
  return db.transaction(async (tx) => {
    const source = await loadItem(tx, sourceRef);
    await requireAccess(tx, actor, source.workspaceId, 'write');
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${'relations:' + source.workspaceId}, 0))`,
    );
    const target = await loadItem(tx, targetRef);
    if (source.workspaceId !== target.workspaceId)
      throw new ValidationError('같은 공간의 항목만 연결할 수 있습니다.');
    const [existing] = await tx
      .select()
      .from(schema.entityLinks)
      .where(
        and(
          eq(schema.entityLinks.workspaceId, source.workspaceId),
          touches(source),
          touches(target),
        ),
      )
      .limit(1);
    if (existing) return { id: existing.id };
    const noteId = source.type === 'note' ? source.id : target.type === 'note' ? target.id : null;
    const projectId =
      source.type === 'project' ? source.id : target.type === 'project' ? target.id : null;
    if (noteId && projectId) {
      const [note] = await tx
        .select({ projectId: schema.notes.projectId })
        .from(schema.notes)
        .where(eq(schema.notes.id, noteId));
      if (note?.projectId === projectId) return { id: `primary:${noteId}` };
    }
    const [a, b] = canonicalRelation(source, target);
    const [saved] = await tx
      .insert(schema.entityLinks)
      .values({
        workspaceId: source.workspaceId,
        sourceType: a.type,
        sourceId: a.id,
        targetType: b.type,
        targetId: b.id,
        linkType: 'related',
      })
      .returning();
    await recordAudit(tx, actor, {
      workspaceId: source.workspaceId,
      action: 'relation.create',
      entityType: source.type,
      entityId: source.id,
      metadata: { relationId: saved!.id },
    });
    return { id: saved!.id };
  });
}
export async function removeRelatedItem(
  db: Executor,
  actor: Actor,
  sourceRaw: unknown,
  id: string,
) {
  if (!isUuid(id)) throw new NotFoundError('연결');
  return db.transaction(async (tx) => {
    const source = await loadItem(tx, sourceRaw);
    await requireAccess(tx, actor, source.workspaceId, 'write');
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${'relations:' + source.workspaceId}, 0))`,
    );
    const [removed] = await tx
      .delete(schema.entityLinks)
      .where(
        and(
          eq(schema.entityLinks.id, id),
          eq(schema.entityLinks.workspaceId, source.workspaceId),
          eq(schema.entityLinks.linkType, 'related'),
          touches(source),
        ),
      )
      .returning();
    if (!removed) throw new NotFoundError('연결');
    await recordAudit(tx, actor, {
      workspaceId: source.workspaceId,
      action: 'relation.remove',
      entityType: source.type,
      entityId: source.id,
    });
  });
}
