import { schema } from '@myos/db';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  createNote,
  createRecurringTask,
  createTask,
  listAutomations,
  listNotifications,
  listRuns,
  purgeExpired,
  retryFailedRuns,
  retryRunNow,
  runAutomationNow,
  runDueAutomations,
  runNoteToTask,
  updateAutomation,
  updateProfile,
  updateTask,
  type EngineDeps,
  type Mailer,
} from '../src';
import { addMember, db, newSharedWorkspace, newUser } from './helpers';

/** 실패 횟수를 지정할 수 있는 가짜 메일러 */
function fakeMailer(failTimes = 0) {
  const sent: { to: string; subject: string }[] = [];
  let failures = failTimes;
  const mailer: Mailer = {
    channel: 'resend',
    async send(m) {
      if (failures > 0) {
        failures--;
        throw new Error('SMTP 연결 실패');
      }
      sent.push(m);
    },
  };
  return { mailer, sent };
}
const deps = (mailer: Mailer): EngineDeps => ({ mailer, appUrl: 'https://myos.test' });

const byTemplate = async (actor: { userId: string }, workspaceId: string, template: string) =>
  (await listAutomations(db, actor, workspaceId)).find((a) => a.template === template)!;

describe('자동화 설정 (AUTO-01)', () => {
  it('6개 템플릿이 기본값으로 준비되고 A03·A05만 켜져 있다', async () => {
    const { actor, workspaceId } = await newUser();
    const list = await listAutomations(db, actor, workspaceId);
    expect(list.map((a) => a.definition.code)).toEqual(['A01', 'A02', 'A03', 'A04', 'A05', 'A06']);
    expect(list.filter((a) => a.enabled).map((a) => a.definition.code)).toEqual(['A03', 'A05']);
    expect(list.find((a) => a.template === 'recurring_tasks')!.nextRunAt).toBeInstanceOf(Date);
    // 다시 조회해도 늘어나지 않는다
    expect(await listAutomations(db, actor, workspaceId)).toHaveLength(6);
  });

  it('켜면 다음 실행 시각이 잡히고, 잘못된 설정은 거부된다', async () => {
    const { actor, workspaceId } = await newUser();
    const a01 = await byTemplate(actor, workspaceId, 'morning_briefing');
    const now = new Date('2026-04-22T01:00:00Z'); // 수 10:00 KST
    const updated = await updateAutomation(
      db,
      actor,
      a01.id,
      { enabled: true, config: { time: '07:30' } },
      now,
    );
    expect(updated.nextRunAt?.toISOString()).toBe('2026-04-22T22:30:00.000Z');
    await expect(
      updateAutomation(db, actor, a01.id, { config: { time: '25:00' } }),
    ).rejects.toThrow('설정');
    const off = await updateAutomation(db, actor, a01.id, { enabled: false });
    expect(off.nextRunAt).toBeNull();
  });

  it('공유 공간 일반 멤버는 A06만 설정할 수 있고, 남의 자동화는 볼 수 없다', async () => {
    const owner = await newUser('owner');
    const editor = await newUser('editor');
    const shared = await newSharedWorkspace(owner.actor.userId);
    await addMember(shared, editor.actor.userId, 'editor');
    expect((await listAutomations(db, editor.actor, shared)).map((a) => a.template)).toEqual([
      'shared_change_alert',
    ]);
    const ownerA01 = await byTemplate(owner.actor, shared, 'morning_briefing');
    await expect(
      updateAutomation(db, editor.actor, ownerA01.id, { enabled: true }),
    ).rejects.toThrow();
  });
});

describe('예약 실행 (AUTO-02)', () => {
  it('예약 시각이 되면 한 번만 실행되고 브리핑 알림·이메일이 간다', async () => {
    const { actor, workspaceId } = await newUser();
    const now = new Date('2026-04-22T01:00:00Z');
    await createTask(db, actor, {
      workspaceId,
      title: '기획서',
      scheduledStart: new Date('2026-04-22T03:00:00Z'),
    });
    const a01 = await byTemplate(actor, workspaceId, 'morning_briefing');
    await updateAutomation(db, actor, a01.id, { enabled: true, config: { time: '08:00' } }, now);

    const { mailer, sent } = fakeMailer();
    const at = new Date('2026-04-22T23:00:30Z'); // 다음날 08:00 KST 직후
    const [first, second] = await Promise.all([
      runDueAutomations(db, deps(mailer), at),
      runDueAutomations(db, deps(mailer), at),
    ]);
    const statuses = [...first!, ...second!].filter((r) => r.status !== 'duplicate');
    expect(statuses).toHaveLength(1);
    expect(sent).toHaveLength(1);
    const notes = await listNotifications(db, actor);
    expect(notes[0]).toMatchObject({ type: 'automation.morning_briefing' });

    const [run] = await listRuns(db, actor, { workspaceId, automationId: a01.id });
    expect(run).toMatchObject({ status: 'succeeded', trigger: 'schedule', attempt: 1 });
    expect(run!.result).toMatchObject({ emailed: true });
    // 다음 예약은 그다음 날로
    const [after] = await db
      .select()
      .from(schema.automations)
      .where(eq(schema.automations.id, a01.id));
    expect(after!.nextRunAt!.toISOString()).toBe('2026-04-23T23:00:00.000Z');
  });

  it('실패하면 기록하고 재시도해 성공한다 (인수 테스트 #4)', async () => {
    const { actor, workspaceId } = await newUser();
    const a01 = await byTemplate(actor, workspaceId, 'morning_briefing');
    await updateAutomation(db, actor, a01.id, { enabled: true });
    const { mailer, sent } = fakeMailer(1);
    const now = new Date();

    const first = await runAutomationNow(db, actor, a01.id, deps(mailer), now);
    expect(first.status).toBe('failed');
    let [run] = await listRuns(db, actor, { workspaceId, automationId: a01.id });
    expect(run).toMatchObject({ status: 'failed', attempt: 1, error: 'SMTP 연결 실패' });
    expect(run!.nextRetryAt!.getTime()).toBe(now.getTime() + 300_000);
    // 실패한 실행의 알림은 롤백되어 남지 않는다
    expect(await listNotifications(db, actor)).toHaveLength(0);

    // 재시도 시각 전에는 아무 일도 없고, 지나면 같은 기록에서 재시도
    expect(await retryFailedRuns(db, deps(mailer), new Date(now.getTime() + 60_000))).toEqual([]);
    const retried = await retryFailedRuns(db, deps(mailer), new Date(now.getTime() + 301_000));
    expect(retried.find((r) => r.runId === run!.id)?.status).toBe('succeeded');
    [run] = await listRuns(db, actor, { workspaceId, automationId: a01.id });
    expect(run).toMatchObject({ status: 'succeeded', attempt: 2, error: null });
    expect(sent).toHaveLength(1);
    expect(await listNotifications(db, actor)).toHaveLength(1);
  });

  it('이메일 수신을 끄면 앱 내 알림만 보낸다', async () => {
    const { actor, workspaceId } = await newUser();
    await updateProfile(db, actor, { name: 'x', timezone: 'Asia/Seoul', notifyEmail: false });
    const a01 = await byTemplate(actor, workspaceId, 'morning_briefing');
    const { mailer, sent } = fakeMailer();
    await runAutomationNow(db, actor, a01.id, deps(mailer));
    expect(sent).toHaveLength(0);
    const [run] = await listRuns(db, actor, { workspaceId, automationId: a01.id });
    expect(run!.result).toMatchObject({ notified: true, emailed: false });
  });

  it('최대 시도 횟수를 넘기면 멈추고 실패 알림을 남긴다', async () => {
    const { actor, workspaceId } = await newUser();
    const a01 = await byTemplate(actor, workspaceId, 'morning_briefing');
    await updateAutomation(db, actor, a01.id, { enabled: true });
    const { mailer } = fakeMailer(10);
    const res = await runAutomationNow(db, actor, a01.id, deps(mailer));
    await retryRunNow(db, actor, res.runId!, deps(mailer));
    await retryRunNow(db, actor, res.runId!, deps(mailer));
    const [run] = await listRuns(db, actor, { workspaceId, automationId: a01.id });
    expect(run).toMatchObject({ status: 'failed', attempt: 3, nextRetryAt: null });
    const notes = await listNotifications(db, actor);
    expect(notes.map((n) => n.type)).toEqual(['automation.failed']);
    await expect(retryRunNow(db, actor, res.runId!, deps(mailer))).resolves.toMatchObject({
      status: 'failed',
    });
  });

  it('실행 시점에 권한이 없으면 건너뛴다 (재검사)', async () => {
    const owner = await newUser('owner');
    const member = await newUser('member');
    const shared = await newSharedWorkspace(owner.actor.userId);
    await addMember(shared, member.actor.userId, 'viewer');
    const a06 = await byTemplate(member.actor, shared, 'shared_change_alert');
    await updateAutomation(db, member.actor, a06.id, { enabled: true });
    // 멤버에서 제외된 뒤 예약 실행
    await db
      .delete(schema.workspaceMembers)
      .where(
        and(
          eq(schema.workspaceMembers.workspaceId, shared),
          eq(schema.workspaceMembers.userId, member.actor.userId),
        ),
      );
    const results = await runDueAutomations(
      db,
      deps(fakeMailer().mailer),
      new Date(Date.now() + 10 * 60_000),
    );
    const [run] = await db
      .select()
      .from(schema.automationRuns)
      .where(eq(schema.automationRuns.automationId, a06.id));
    expect(run).toMatchObject({ status: 'skipped' });
    expect(results.some((r) => r.runId === run!.id)).toBe(true);
  });
});

describe('템플릿 동작', () => {
  it('A02 마감 임박: 기간 안의 미완료만', async () => {
    const { actor, workspaceId } = await newUser();
    const now = new Date('2026-04-22T00:00:00Z'); // 09:00 KST
    await createTask(db, actor, {
      workspaceId,
      title: '내일 마감',
      dueAt: new Date('2026-04-23T10:00:00Z'),
    });
    await createTask(db, actor, {
      workspaceId,
      title: '다음주 마감',
      dueAt: new Date('2026-04-29T10:00:00Z'),
    });
    const done = await createTask(db, actor, {
      workspaceId,
      title: '완료됨',
      dueAt: new Date('2026-04-22T10:00:00Z'),
    });
    await updateTask(db, actor, done.id, { status: 'done' });
    const a02 = await byTemplate(actor, workspaceId, 'deadline_alert');
    await runAutomationNow(db, actor, a02.id, deps(fakeMailer().mailer), now);
    const [n] = await listNotifications(db, actor);
    expect(n).toMatchObject({ title: '마감 임박 할 일 1개', message: '내일 마감' });
  });

  it('A03 반복 할 일: 예약 실행으로 다음 회차 생성', async () => {
    const { actor, workspaceId } = await newUser();
    await createRecurringTask(
      db,
      actor,
      {
        workspaceId,
        title: '일일 점검',
        rule: { freq: 'daily' },
        timezone: 'Asia/Seoul',
        startDate: '2026-04-22',
      },
      '2026-04-22',
    );
    const a03 = await byTemplate(actor, workspaceId, 'recurring_tasks');
    const res = await runAutomationNow(
      db,
      actor,
      a03.id,
      deps(fakeMailer().mailer),
      new Date('2026-04-23T01:00:00Z'),
    );
    expect(res.status).toBe('succeeded');
    const [run] = await listRuns(db, actor, { workspaceId, automationId: a03.id });
    expect(run!.result).toEqual({ series: 1, created: 1 });
  });

  it('A04 주간 리뷰: 리뷰 노트 생성', async () => {
    const { actor, workspaceId } = await newUser();
    const t = await createTask(db, actor, { workspaceId, title: '완료한 일' });
    await updateTask(db, actor, t.id, { status: 'done' });
    await createTask(db, actor, { workspaceId, title: '남은 일', scheduledStart: new Date() });
    const a04 = await byTemplate(actor, workspaceId, 'weekly_review');
    await runAutomationNow(db, actor, a04.id, deps(fakeMailer().mailer));
    const [run] = await listRuns(db, actor, { workspaceId, automationId: a04.id });
    expect(run!.result).toMatchObject({ completed: 1, open: 1 });
    const [note] = await db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.id, run!.result!.noteId as string));
    expect(note!.content).toContain('• 완료한 일');
  });

  it('A05 메모에서 할 일: 켜져 있으면 마감일 적용 + 기록', async () => {
    const { actor, workspaceId } = await newUser();
    const a05 = await byTemplate(actor, workspaceId, 'note_to_task');
    await updateAutomation(db, actor, a05.id, { config: { dueInDays: 3 } });
    const note = await createNote(db, actor, { workspaceId, title: '회의록' });
    const task = await runNoteToTask(
      db,
      actor,
      note.id,
      '후속 메일',
      new Date('2026-04-22T00:00:00Z'),
    );
    const [saved] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id));
    expect(saved!.dueAt?.toISOString()).toBe('2026-04-25T00:00:00.000Z');
    const [run] = await listRuns(db, actor, { workspaceId, automationId: a05.id });
    expect(run).toMatchObject({ trigger: 'event', status: 'succeeded' });
    await expect(runAutomationNow(db, actor, a05.id, deps(fakeMailer().mailer))).rejects.toThrow(
      '직접 실행',
    );
  });

  it('A06 공유 공간 변경 알림: 다른 사람의 변경만, 한 번씩', async () => {
    const owner = await newUser('owner');
    const editor = await newUser('editor');
    const shared = await newSharedWorkspace(owner.actor.userId);
    await addMember(shared, editor.actor.userId, 'editor');
    const a06 = await byTemplate(owner.actor, shared, 'shared_change_alert');
    await updateAutomation(db, owner.actor, a06.id, { enabled: true });

    await createTask(db, owner.actor, { workspaceId: shared, title: '내가 만든 일' });
    const t = await createTask(db, editor.actor, {
      workspaceId: shared,
      title: '편집자가 만든 일',
    });
    await updateTask(db, editor.actor, t.id, { status: 'done' });

    const d = deps(fakeMailer().mailer);
    await runAutomationNow(db, owner.actor, a06.id, d);
    await runAutomationNow(db, owner.actor, a06.id, d); // 새 변경 없음
    const notes = await listNotifications(db, owner.actor);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ title: '공유 공간 변경 2건' });
  });
});

describe('보존 기간 정리', () => {
  it('30일 지난 휴지통과 90일 지난 실행 기록을 지운다', async () => {
    const { actor, workspaceId } = await newUser();
    const old = await createTask(db, actor, { workspaceId, title: 'old', tags: ['x'] });
    const recent = await createTask(db, actor, { workspaceId, title: 'recent' });
    const now = new Date();
    await db
      .update(schema.tasks)
      .set({ deletedAt: new Date(now.getTime() - 31 * 86_400_000) })
      .where(eq(schema.tasks.id, old.id));
    await db
      .update(schema.tasks)
      .set({ deletedAt: new Date(now.getTime() - 5 * 86_400_000) })
      .where(eq(schema.tasks.id, recent.id));
    const purged = await purgeExpired(db, now);
    expect(purged.tasks).toBeGreaterThanOrEqual(1);
    const left = await db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(eq(schema.tasks.workspaceId, workspaceId));
    expect(left.map((r) => r.id)).toEqual([recent.id]);
    const tags = await db
      .select()
      .from(schema.entityTags)
      .where(eq(schema.entityTags.entityId, old.id));
    expect(tags).toHaveLength(0);
  });
});
