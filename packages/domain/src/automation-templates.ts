import {
  formatLocalDay,
  getPeriodRange,
  isValidTime,
  localDateToUtc,
  addDaysToDate,
  type AutomationSchedule,
  type WorkspaceAction,
} from '@myos/core';
import { schema } from '@myos/db';
import { and, asc, eq, gte, isNull, lte, ne, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Actor, Executor } from './context';
import type { Mailer } from './mailer';
import { notify } from './notifications';
import { createNote } from './notes';
import { generateDueOccurrences } from './recurring';
import { listTasks } from './tasks';

const { tasks, inboxItems, auditLogs, workspaces, users } = schema;

export type AutomationTemplate = (typeof schema.automationTemplate.enumValues)[number];
type Automation = typeof schema.automations.$inferSelect;
type User = typeof users.$inferSelect;

export interface RunContext {
  db: Executor;
  automation: Automation;
  owner: User;
  actor: Actor;
  now: Date;
  timeZone: string;
  /** 사용자 시간대의 오늘 (YYYY-MM-DD) */
  today: string;
  mailer: Mailer;
  appUrl: string;
}

export interface RunOutcome {
  input: Record<string, unknown>;
  result: Record<string, unknown>;
  /** 템플릿 내부 상태 갱신 (같은 트랜잭션에서 저장) */
  state?: Record<string, unknown>;
}

export interface TemplateDefinition<C extends z.ZodType = z.ZodType> {
  code: string;
  name: string;
  description: string;
  config: C;
  /** null이면 예약 실행 없음(사용자 요청으로만 실행) */
  schedule: (config: z.output<C>) => AutomationSchedule | null;
  /** 실행 시점에 다시 확인할 권한 */
  requiredAction: WorkspaceAction;
  /** 설정에 필요한 권한 (공유 공간에서 일반 멤버는 A06만 켤 수 있다) */
  manageAction: WorkspaceAction;
  defaultEnabled: boolean;
  manualRun: boolean;
  run: (ctx: RunContext, config: z.output<C>) => Promise<RunOutcome>;
}

/** 설정 스키마로부터 run/schedule의 config 타입을 추론하기 위한 도우미 */
function define<C extends z.ZodType>(def: TemplateDefinition<C>): TemplateDefinition {
  return def as unknown as TemplateDefinition;
}

const time = z.string().refine(isValidTime, 'HH:MM 형식');

/** 앱 내 알림 + (사용자가 허용했고 메일 채널이 있으면) 이메일 */
async function deliver(
  ctx: RunContext,
  message: { type: string; title: string; message: string; link?: string; email?: string },
) {
  let emailed = false;
  if (ctx.owner.notifyEmail && ctx.mailer.channel !== 'none') {
    await ctx.mailer.send({
      to: ctx.owner.email,
      subject: `[MyOS] ${message.title}`,
      text: `${message.email ?? message.message}${message.link ? `\n\n${ctx.appUrl}${message.link}` : ''}`,
    });
    emailed = true;
  }
  await notify(ctx.db, {
    userId: ctx.owner.id,
    workspaceId: ctx.automation.workspaceId,
    type: `automation.${ctx.automation.template}`,
    title: message.title,
    message: message.message,
    link: message.link,
  });
  return { notified: true, emailed };
}

const bullet = (items: { title: string }[]) => items.map((t) => `• ${t.title}`).join('\n');

// ── A01 아침 업무 브리핑 ────────────────────────────────────
const morningBriefing = define({
  code: 'A01',
  name: '아침 업무 브리핑',
  description: '매일 지정 시각에 오늘 할 일·지난 할 일·인박스를 요약해 알려줍니다.',
  config: z.object({ time: time.default('08:00'), weekdaysOnly: z.boolean().default(false) }),
  schedule: (c) => ({
    kind: 'daily',
    time: c.time,
    weekdays: c.weekdaysOnly ? [1, 2, 3, 4, 5] : undefined,
  }),
  requiredAction: 'read',
  manageAction: 'manage',
  defaultEnabled: false,
  manualRun: true,
  async run(ctx) {
    const { start, end } = getPeriodRange('today', ctx.now, ctx.timeZone);
    const workspaceId = ctx.automation.workspaceId;
    const [today, overdue, inbox] = await Promise.all([
      listTasks(ctx.db, ctx.actor, {
        workspaceId,
        from: start!,
        to: end!,
        status: ['todo', 'in_progress'],
      }),
      listTasks(ctx.db, ctx.actor, {
        workspaceId,
        to: new Date(start!.getTime() - 1),
        status: ['todo', 'in_progress'],
      }),
      ctx.db
        .select({ id: inboxItems.id })
        .from(inboxItems)
        .where(and(eq(inboxItems.workspaceId, workspaceId), isNull(inboxItems.processedAt))),
    ]);
    const summary = `할 일 ${today.length}개 · 지난 할 일 ${overdue.length}개 · 인박스 ${inbox.length}개`;
    const delivery = await deliver(ctx, {
      type: 'briefing',
      title: `오늘의 브리핑 · ${formatLocalDay(ctx.now, ctx.timeZone)}`,
      message: summary,
      link: '/tasks',
      email: [
        summary,
        today.length ? `\n[오늘 할 일]\n${bullet(today)}` : '',
        overdue.length ? `\n[지난 할 일]\n${bullet(overdue)}` : '',
      ].join('\n'),
    });
    return {
      input: { date: ctx.today },
      result: { today: today.length, overdue: overdue.length, inbox: inbox.length, ...delivery },
    };
  },
});

// ── A02 마감 임박 알림 ──────────────────────────────────────
const deadlineAlert = define({
  code: 'A02',
  name: '마감 임박 알림',
  description: '매일 검사해 마감이 가까운 미완료 할 일을 알려줍니다.',
  config: z.object({
    time: time.default('09:00'),
    daysBefore: z.number().int().min(0).max(14).default(1),
  }),
  schedule: (c) => ({ kind: 'daily', time: c.time }),
  requiredAction: 'read',
  manageAction: 'manage',
  defaultEnabled: false,
  manualRun: true,
  async run(ctx, c) {
    const until = localDateToUtc(addDaysToDate(ctx.today, c.daysBefore + 1), ctx.timeZone);
    const due = await ctx.db
      .select({ id: tasks.id, title: tasks.title, dueAt: tasks.dueAt })
      .from(tasks)
      .where(
        and(
          eq(tasks.workspaceId, ctx.automation.workspaceId),
          isNull(tasks.deletedAt),
          notInArray(tasks.status, ['done', 'cancelled']),
          gte(tasks.dueAt, ctx.now),
          lte(tasks.dueAt, new Date(until.getTime() - 1)),
        ),
      )
      .orderBy(asc(tasks.dueAt));
    if (due.length === 0) return { input: { daysBefore: c.daysBefore }, result: { count: 0 } };
    const delivery = await deliver(ctx, {
      type: 'deadline',
      title: `마감 임박 할 일 ${due.length}개`,
      message: due
        .slice(0, 3)
        .map((t) => t.title)
        .join(', ')
        .concat(due.length > 3 ? ` 외 ${due.length - 3}개` : ''),
      link: '/tasks',
      email: due
        .map((t) => `• ${t.title} (마감 ${formatLocalDay(t.dueAt!, ctx.timeZone)})`)
        .join('\n'),
    });
    return { input: { daysBefore: c.daysBefore }, result: { count: due.length, ...delivery } };
  },
});

// ── A03 반복 할 일 ─────────────────────────────────────────
const recurringTasks = define({
  code: 'A03',
  name: '반복 할 일',
  description: '반복 설정한 할 일의 다음 회차를 중복 없이 만듭니다.',
  config: z.object({ time: time.default('00:05') }),
  schedule: (c) => ({ kind: 'daily', time: c.time }),
  requiredAction: 'write',
  manageAction: 'manage',
  defaultEnabled: true,
  manualRun: true,
  async run(ctx) {
    const result = await generateDueOccurrences(ctx.db, ctx.automation.workspaceId, ctx.today);
    return { input: { date: ctx.today }, result };
  },
});

// ── A04 주간 리뷰 ──────────────────────────────────────────
const weeklyReview = define({
  code: 'A04',
  name: '주간 리뷰',
  description: '매주 지정 요일에 이번 주 완료·미완료 할 일을 정리한 노트를 만듭니다.',
  config: z.object({
    weekday: z.number().int().min(0).max(6).default(5),
    time: time.default('18:00'),
  }),
  schedule: (c) => ({ kind: 'weekly', weekday: c.weekday, time: c.time }),
  requiredAction: 'write',
  manageAction: 'manage',
  defaultEnabled: false,
  manualRun: true,
  async run(ctx) {
    const { start, end } = getPeriodRange('week', ctx.now, ctx.timeZone);
    const workspaceId = ctx.automation.workspaceId;
    const completed = await ctx.db
      .select({ title: tasks.title })
      .from(tasks)
      .where(
        and(
          eq(tasks.workspaceId, workspaceId),
          isNull(tasks.deletedAt),
          eq(tasks.status, 'done'),
          gte(tasks.completedAt, start!),
          lte(tasks.completedAt, end!),
        ),
      );
    const open = await listTasks(ctx.db, ctx.actor, {
      workspaceId,
      to: end!,
      status: ['todo', 'in_progress'],
    });
    const weekLabel = `${formatLocalDay(start!, ctx.timeZone)} ~ ${formatLocalDay(end!, ctx.timeZone)}`;
    const note = await createNote(ctx.db, ctx.actor, {
      workspaceId,
      title: `주간 리뷰 · ${weekLabel}`,
      type: 'note',
      tags: ['주간리뷰'],
      content: [
        `## 완료 (${completed.length})`,
        bullet(completed) || '없음',
        '',
        `## 미완료 (${open.length})`,
        bullet(open) || '없음',
        '',
        '## 다음 주 계획',
        '',
      ].join('\n'),
    });
    const delivery = await deliver(ctx, {
      type: 'weekly_review',
      title: '주간 리뷰가 준비되었습니다',
      message: `완료 ${completed.length}개 · 미완료 ${open.length}개`,
      link: `/knowledge/${note.id}`,
    });
    return {
      input: { week: weekLabel },
      result: { completed: completed.length, open: open.length, noteId: note.id, ...delivery },
    };
  },
});

// ── A05 메모에서 할 일 생성 ─────────────────────────────────
const noteToTask = define({
  code: 'A05',
  name: '메모에서 할 일 생성',
  description: '노트의 "할 일로 만들기"로 원본 메모와 연결된 할 일을 만들고 기록합니다.',
  config: z.object({ dueInDays: z.number().int().min(0).max(60).nullable().default(null) }),
  schedule: () => null,
  requiredAction: 'write',
  manageAction: 'manage',
  defaultEnabled: true,
  manualRun: false,
  // 실행 본체는 notes 화면 요청 시 runNoteToTask가 수행한다
  async run() {
    return { input: {}, result: {} };
  },
});

// ── A06 공유 프로젝트 변경 알림 ─────────────────────────────
const sharedChangeAlert = define({
  code: 'A06',
  name: '공유 공간 변경 알림',
  description: '공유 공간에서 다른 사람이 항목을 바꾸면 알려줍니다.',
  config: z.object({ intervalMinutes: z.number().int().min(5).max(60).default(5) }),
  schedule: (c) => ({ kind: 'interval', minutes: c.intervalMinutes }),
  requiredAction: 'read',
  manageAction: 'read',
  defaultEnabled: false,
  manualRun: true,
  async run(ctx) {
    const [ws] = await ctx.db
      .select({ type: workspaces.type })
      .from(workspaces)
      .where(eq(workspaces.id, ctx.automation.workspaceId));
    if (ws?.type !== 'shared')
      return { input: {}, result: { skipped: '개인 공간에는 변경 알림이 없습니다' } };

    const cursor =
      typeof ctx.automation.state.cursor === 'string'
        ? new Date(ctx.automation.state.cursor)
        : ctx.automation.createdAt;
    const changes = await ctx.db
      .select({
        action: auditLogs.action,
        createdAt: auditLogs.createdAt,
        actorName: users.name,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorId))
      .where(
        and(
          eq(auditLogs.workspaceId, ctx.automation.workspaceId),
          // DB는 마이크로초, 커서(JS Date)는 밀리초까지라 밀리초 단위로 비교한다
          sql`date_trunc('milliseconds', ${auditLogs.createdAt}) > ${cursor.toISOString()}::timestamptz`,
          ne(auditLogs.actorId, ctx.owner.id),
        ),
      )
      .orderBy(asc(auditLogs.createdAt))
      .limit(200);
    if (changes.length === 0)
      return { input: { since: cursor.toISOString() }, result: { count: 0 } };

    const people = [...new Set(changes.map((c) => c.actorName ?? '알 수 없음'))];
    const delivery = await deliver(ctx, {
      type: 'shared_change',
      title: `공유 공간 변경 ${changes.length}건`,
      message: `${people.slice(0, 3).join(', ')}${people.length > 3 ? ' 외' : ''}님이 항목을 변경했습니다.`,
    });
    return {
      input: { since: cursor.toISOString() },
      result: { count: changes.length, ...delivery },
      state: { cursor: changes.at(-1)!.createdAt.toISOString() },
    };
  },
});

export const TEMPLATES: Record<AutomationTemplate, TemplateDefinition> = {
  morning_briefing: morningBriefing,
  deadline_alert: deadlineAlert,
  recurring_tasks: recurringTasks,
  weekly_review: weeklyReview,
  note_to_task: noteToTask,
  shared_change_alert: sharedChangeAlert,
};

export const TEMPLATE_ORDER = Object.keys(TEMPLATES) as AutomationTemplate[];

/** 저장된 설정을 템플릿 기본값과 합쳐 검증한다. 잘못된 값은 기본값으로 대체된다. */
export function resolveConfig(template: AutomationTemplate, raw: unknown): Record<string, unknown> {
  const def = TEMPLATES[template];
  const parsed = def.config.safeParse(raw ?? {});
  return (parsed.success ? parsed.data : def.config.parse({})) as Record<string, unknown>;
}
