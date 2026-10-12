import { describe, expect, it } from 'vitest';
import { schema } from '@myos/db';
import { eq } from 'drizzle-orm';
import {
  archiveInbox,
  captureInbox,
  convertInboxToNote,
  convertInboxToTask,
  createNote,
  createTaskFromNote,
  listInbox,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notify,
  reopenInbox,
  splitContent,
  unreadNotificationCount,
} from '../src';
import { db, newUser } from './helpers';

describe('인박스 (INBOX-01)', () => {
  it('빠른 입력 → 할 일/노트 변환 → 보관', async () => {
    const { actor, workspaceId } = await newUser();
    const a = await captureInbox(db, actor, { workspaceId, content: '회의 준비\n자료 3부 출력' });
    const b = await captureInbox(db, actor, { workspaceId, content: '카페 메뉴 아이디어' });
    const c = await captureInbox(db, actor, { workspaceId, content: '읽을 링크' });
    expect(await listInbox(db, actor, { workspaceId })).toHaveLength(3);

    const task = await convertInboxToTask(db, actor, a.id);
    expect(task).toMatchObject({ title: '회의 준비', description: '자료 3부 출력' });
    const note = await convertInboxToNote(db, actor, b.id, { type: 'idea' });
    expect(note.type).toBe('idea');
    await archiveInbox(db, actor, c.id);

    expect(await listInbox(db, actor, { workspaceId })).toHaveLength(0);
    const processed = await listInbox(db, actor, { workspaceId, processed: true });
    expect(processed.map((i) => i.result).sort()).toEqual(['archived', 'note', 'task']);

    await expect(convertInboxToTask(db, actor, a.id)).rejects.toThrow('이미 처리');
    await reopenInbox(db, actor, c.id);
    expect(await listInbox(db, actor, { workspaceId })).toHaveLength(1);
  });

  it('splitContent', () => {
    expect(splitContent('  제목\n\n본문  ')).toEqual({ title: '제목', body: '본문' });
    expect(splitContent('한 줄')).toEqual({ title: '한 줄', body: null });
  });

  it('노트에서 할 일 만들기는 원본 노트와 연결된다', async () => {
    const { actor, workspaceId } = await newUser();
    const note = await createNote(db, actor, { workspaceId, title: '회의록' });
    const task = await createTaskFromNote(db, actor, note.id, { title: '후속 메일' });
    const links = await db
      .select()
      .from(schema.entityLinks)
      .where(eq(schema.entityLinks.sourceId, task.id));
    expect(links).toMatchObject([{ targetId: note.id, linkType: 'derived_from' }]);
  });
});

describe('알림 (NOTI-01)', () => {
  it('읽음 처리는 본인 알림에만 적용된다', async () => {
    const me = await newUser('me');
    const other = await newUser('other');
    const n1 = await notify(db, { userId: me.actor.userId, type: 'test', title: '첫 알림' });
    await notify(db, { userId: me.actor.userId, type: 'test', title: '둘째 알림' });
    expect(await unreadNotificationCount(db, me.actor)).toBe(2);

    await markNotificationRead(db, other.actor, n1.id);
    expect(await unreadNotificationCount(db, me.actor)).toBe(2);

    await markNotificationRead(db, me.actor, n1.id);
    expect(await unreadNotificationCount(db, me.actor)).toBe(1);
    await markAllNotificationsRead(db, me.actor);
    expect(await unreadNotificationCount(db, me.actor)).toBe(0);
    expect(await listNotifications(db, other.actor)).toHaveLength(0);
  });
});
