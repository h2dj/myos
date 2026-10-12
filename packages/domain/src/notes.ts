import { schema } from '@myos/db';
import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { z } from 'zod';
import { assertProjectInWorkspace, requireAccess } from './access';
import { recordAudit } from './audit';
import type { Actor, Executor } from './context';
import { NotFoundError } from './errors';
import { replaceEntityTags, tagNamesSchema, tagsFor, type TagRef } from './tags';
import { isUuid, parse } from './validation';

const { notes, tags, entityTags } = schema;

export type Note = typeof notes.$inferSelect;
export type NoteType = Note['type'];
export type NoteWithTags = Note & { tags: TagRef[] };

const fields = {
  title: z.string().trim().min(1, '제목을 입력하세요').max(300),
  content: z.string().max(200_000).optional(),
  type: z.enum(notes.type.enumValues).optional(),
  projectId: z.uuid().nullable().optional(),
  isFavorite: z.boolean().optional(),
  tags: tagNamesSchema.optional(),
};
const createInput = z.object({ workspaceId: z.uuid(), ...fields });
const updateInput = z.object(fields).partial();

export async function createNote(db: Executor, actor: Actor, input: z.input<typeof createInput>) {
  const { workspaceId, tags: tagNames, ...data } = parse(createInput, input);
  return db.transaction(async (tx) => {
    await requireAccess(tx, actor, workspaceId, 'write');
    if (data.projectId) await assertProjectInWorkspace(tx, data.projectId, workspaceId);
    const [note] = await tx
      .insert(notes)
      .values({ ...data, workspaceId, createdBy: actor.userId })
      .returning();
    if (tagNames) await replaceEntityTags(tx, workspaceId, 'note', note!.id, tagNames);
    await recordAudit(tx, actor, {
      workspaceId,
      action: 'note.create',
      entityType: 'note',
      entityId: note!.id,
    });
    return note!;
  });
}

export async function updateNote(
  db: Executor,
  actor: Actor,
  noteId: string,
  input: z.input<typeof updateInput>,
) {
  const { tags: tagNames, ...data } = parse(updateInput, input);
  return db.transaction(async (tx) => {
    const current = await loadNote(tx, noteId);
    await requireAccess(tx, actor, current.workspaceId, 'write');
    if (data.projectId) await assertProjectInWorkspace(tx, data.projectId, current.workspaceId);
    const [note] = await tx.update(notes).set(data).where(eq(notes.id, noteId)).returning();
    if (tagNames) await replaceEntityTags(tx, current.workspaceId, 'note', noteId, tagNames);
    return note!;
  });
}

export async function deleteNote(db: Executor, actor: Actor, noteId: string) {
  await db.transaction(async (tx) => {
    const current = await loadNote(tx, noteId);
    await requireAccess(tx, actor, current.workspaceId, 'write');
    await tx.update(notes).set({ deletedAt: new Date() }).where(eq(notes.id, noteId));
    await recordAudit(tx, actor, {
      workspaceId: current.workspaceId,
      action: 'note.delete',
      entityType: 'note',
      entityId: noteId,
    });
  });
}

export async function restoreNote(db: Executor, actor: Actor, noteId: string) {
  return db.transaction(async (tx) => {
    const current = await loadNote(tx, noteId, { includeDeleted: true });
    await requireAccess(tx, actor, current.workspaceId, 'write');
    const [note] = await tx
      .update(notes)
      .set({ deletedAt: null })
      .where(eq(notes.id, noteId))
      .returning();
    return note!;
  });
}

export async function getNote(
  db: Executor,
  actor: Actor,
  noteId: string,
  opts: { includeDeleted?: boolean } = {},
): Promise<NoteWithTags> {
  const note = await loadNote(db, noteId, opts);
  await requireAccess(db, actor, note.workspaceId, 'read');
  const tagMap = await tagsFor(db, 'note', [note.id]);
  return { ...note, tags: tagMap.get(note.id) ?? [] };
}

const listInput = z.object({
  workspaceId: z.uuid(),
  type: z.enum(notes.type.enumValues).optional(),
  projectId: z.uuid().optional(),
  tag: z.string().optional(),
  favorite: z.boolean().optional(),
  query: z.string().trim().max(100).optional(),
  trash: z.boolean().optional(),
  limit: z.number().int().min(1).max(500).default(200),
});

export async function listNotes(
  db: Executor,
  actor: Actor,
  input: z.input<typeof listInput>,
): Promise<NoteWithTags[]> {
  const q = parse(listInput, input);
  await requireAccess(db, actor, q.workspaceId, 'read');

  let tagFilter: SQL | undefined;
  if (q.tag) {
    const tagged = db
      .select({ id: entityTags.entityId })
      .from(entityTags)
      .innerJoin(tags, eq(tags.id, entityTags.tagId))
      .where(
        and(
          eq(entityTags.entityType, 'note'),
          eq(tags.workspaceId, q.workspaceId),
          eq(tags.name, q.tag),
        ),
      );
    tagFilter = inArray(notes.id, tagged);
  }
  const pattern = q.query ? `%${q.query.replace(/[\\%_]/g, '\\$&')}%` : undefined;

  const rows = await db
    .select()
    .from(notes)
    .where(
      and(
        eq(notes.workspaceId, q.workspaceId),
        q.trash ? isNotNull(notes.deletedAt) : isNull(notes.deletedAt),
        q.type ? eq(notes.type, q.type) : undefined,
        q.projectId ? eq(notes.projectId, q.projectId) : undefined,
        q.favorite ? eq(notes.isFavorite, true) : undefined,
        pattern ? or(ilike(notes.title, pattern), ilike(notes.content, pattern)) : undefined,
        tagFilter,
      ),
    )
    .orderBy(desc(notes.updatedAt))
    .limit(q.limit);

  const tagMap = await tagsFor(
    db,
    'note',
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }));
}

/** 공간의 노트 수 (전체 / 유형별) — 지식 화면 폴더 영역 */
export async function countNotesByType(db: Executor, actor: Actor, workspaceId: string) {
  await requireAccess(db, actor, workspaceId, 'read');
  const rows = await db
    .select({
      type: notes.type,
      total: count(),
      favorite: sql<number>`count(*) filter (where ${notes.isFavorite})`.mapWith(Number),
    })
    .from(notes)
    .where(and(eq(notes.workspaceId, workspaceId), isNull(notes.deletedAt)))
    .groupBy(notes.type);
  const counts: Record<NoteType | 'all' | 'favorite', number> = {
    all: 0,
    favorite: 0,
    note: 0,
    idea: 0,
    resource: 0,
  };
  for (const r of rows) {
    counts[r.type] = r.total;
    counts.all += r.total;
    counts.favorite += r.favorite;
  }
  return counts;
}

async function loadNote(db: Executor, id: string, opts: { includeDeleted?: boolean } = {}) {
  if (!isUuid(id)) throw new NotFoundError('노트');
  const [n] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), opts.includeDeleted ? undefined : isNull(notes.deletedAt)));
  if (!n) throw new NotFoundError('노트');
  return n;
}
