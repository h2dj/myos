import { schema } from '@myos/db';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { requireAccess } from './access';
import type { Actor, Executor } from './context';
import { NotFoundError, ValidationError } from './errors';
import { createNote } from './notes';
import { createTask } from './tasks';
import { isUuid, parse } from './validation';

const { inboxItems, entityLinks } = schema;

export type InboxItem = typeof inboxItems.$inferSelect;

const captureInput = z.object({
  workspaceId: z.uuid(),
  content: z.string().trim().min(1, '내용을 입력하세요').max(5_000),
  source: z.enum(inboxItems.source.enumValues).optional(),
});

/** 빠른 입력 (INBOX-01) */
export async function captureInbox(
  db: Executor,
  actor: Actor,
  input: z.input<typeof captureInput>,
) {
  const data = parse(captureInput, input);
  await requireAccess(db, actor, data.workspaceId, 'write');
  const [item] = await db
    .insert(inboxItems)
    .values({ ...data, createdBy: actor.userId })
    .returning();
  return item!;
}

export async function listInbox(
  db: Executor,
  actor: Actor,
  input: { workspaceId: string; processed?: boolean; limit?: number },
) {
  await requireAccess(db, actor, input.workspaceId, 'read');
  return db
    .select()
    .from(inboxItems)
    .where(
      and(
        eq(inboxItems.workspaceId, input.workspaceId),
        input.processed ? isNotNull(inboxItems.processedAt) : isNull(inboxItems.processedAt),
      ),
    )
    .orderBy(desc(inboxItems.createdAt))
    .limit(input.limit ?? 200);
}

/** 인박스 항목을 할 일로 변환. 첫 줄은 제목, 나머지는 설명이 된다. */
export async function convertInboxToTask(
  db: Executor,
  actor: Actor,
  itemId: string,
  overrides: { title?: string; projectId?: string | null; scheduledStart?: Date | null } = {},
) {
  return db.transaction(async (tx) => {
    const item = await loadPending(tx, actor, itemId);
    const { title, body } = splitContent(item.content);
    const task = await createTask(tx, actor, {
      workspaceId: item.workspaceId,
      title: overrides.title ?? title,
      description: body,
      projectId: overrides.projectId,
      scheduledStart: overrides.scheduledStart,
    });
    await markProcessed(tx, item.id, 'task', task.id);
    return task;
  });
}

export async function convertInboxToNote(
  db: Executor,
  actor: Actor,
  itemId: string,
  overrides: { title?: string; type?: 'note' | 'idea' | 'resource' } = {},
) {
  return db.transaction(async (tx) => {
    const item = await loadPending(tx, actor, itemId);
    const { title, body } = splitContent(item.content);
    const note = await createNote(tx, actor, {
      workspaceId: item.workspaceId,
      title: overrides.title ?? title,
      content: body ?? '',
      type: overrides.type ?? 'note',
    });
    await markProcessed(tx, item.id, 'note', note.id);
    return note;
  });
}

export async function archiveInbox(db: Executor, actor: Actor, itemId: string) {
  await db.transaction(async (tx) => {
    const item = await loadPending(tx, actor, itemId);
    await markProcessed(tx, item.id, 'archived', null);
  });
}

/** 처리 취소(보관 되돌리기). 변환으로 생긴 할 일/노트는 그대로 둔다. */
export async function reopenInbox(db: Executor, actor: Actor, itemId: string) {
  if (!isUuid(itemId)) throw new NotFoundError('인박스 항목');
  const [item] = await db.select().from(inboxItems).where(eq(inboxItems.id, itemId));
  if (!item) throw new NotFoundError('인박스 항목');
  await requireAccess(db, actor, item.workspaceId, 'write');
  await db
    .update(inboxItems)
    .set({ processedAt: null, result: null, resultId: null })
    .where(eq(inboxItems.id, itemId));
}

/** 노트에서 할 일 만들기 (자동화 A05의 수동 실행 경로). 원본 노트와 derived_from으로 연결한다. */
export async function createTaskFromNote(
  db: Executor,
  actor: Actor,
  noteId: string,
  input: { title: string },
) {
  if (!isUuid(noteId)) throw new NotFoundError('노트');
  return db.transaction(async (tx) => {
    const [note] = await tx
      .select()
      .from(schema.notes)
      .where(and(eq(schema.notes.id, noteId), isNull(schema.notes.deletedAt)));
    if (!note) throw new NotFoundError('노트');
    const task = await createTask(tx, actor, {
      workspaceId: note.workspaceId,
      title: input.title,
      projectId: note.projectId,
    });
    await tx.insert(entityLinks).values({
      workspaceId: note.workspaceId,
      sourceType: 'task',
      sourceId: task.id,
      targetType: 'note',
      targetId: note.id,
      linkType: 'derived_from',
    });
    return task;
  });
}

async function loadPending(db: Executor, actor: Actor, itemId: string) {
  if (!isUuid(itemId)) throw new NotFoundError('인박스 항목');
  const [item] = await db.select().from(inboxItems).where(eq(inboxItems.id, itemId));
  if (!item) throw new NotFoundError('인박스 항목');
  await requireAccess(db, actor, item.workspaceId, 'write');
  if (item.processedAt) throw new ValidationError('이미 처리된 항목입니다.');
  return item;
}

async function markProcessed(
  db: Executor,
  id: string,
  result: 'task' | 'note' | 'archived',
  resultId: string | null,
) {
  await db
    .update(inboxItems)
    .set({ processedAt: new Date(), result, resultId })
    .where(eq(inboxItems.id, id));
}

export function splitContent(content: string): { title: string; body: string | null } {
  const [first = '', ...rest] = content.trim().split('\n');
  const title = first.trim().slice(0, 300) || '제목 없음';
  const body = rest.join('\n').trim();
  return { title, body: body || null };
}
