import { randomUUID } from 'node:crypto';
import { addLocalDays, can, describeSchedule, nextRunAfter, utcToLocalDate } from '@myos/core';
import { schema } from '@myos/db';
import { and, asc, desc, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { requireAccess } from './access';
import {
  TEMPLATES,
  TEMPLATE_ORDER,
  resolveConfig,
  type AutomationTemplate,
  type RunOutcome,
} from './automation-templates';
import type { Actor, Executor } from './context';
import { DomainError, ForbiddenError, NotFoundError, ValidationError } from './errors';
import { createTaskFromNote } from './inbox';
import type { Mailer } from './mailer';
import { notify } from './notifications';
import { updateTask } from './tasks';
import { isUuid } from './validation';

const { automations, automationRuns, users } = schema;

export type Automation = typeof automations.$inferSelect;
export type AutomationRun = typeof automationRuns.$inferSelect;

export interface EngineDeps {
  mailer: Mailer;
  /** 이메일 본문 링크용 앱 주소 */
  appUrl: string;
}

// ── 설정 관리 ──────────────────────────────────────────────

function scheduleNext(
  automation: Pick<Automation, 'template' | 'config' | 'timezone' | 'enabled'>,
  now: Date,
) {
  if (!automation.enabled) return null;
  const def = TEMPLATES[automation.template];
  const schedule = def.schedule(resolveConfig(automation.template, automation.config));
  return schedule ? nextRunAfter(schedule, now, automation.timezone) : null;
}

async function roleIn(db: Executor, actor: Actor, workspaceId: string) {
  return requireAccess(db, actor, workspaceId, 'read');
}

/**
 * 사용자가 공간에서 쓸 수 있는 자동화 목록. 처음 조회할 때 템플릿별 행을 기본값으로 만든다.
 * 공간 소유자는 6종 모두, 일반 멤버는 '공유 공간 변경 알림'만 설정할 수 있다 (기획서 §7).
 */
export async function listAutomations(
  db: Executor,
  actor: Actor,
  workspaceId: string,
  now = new Date(),
) {
  const role = await roleIn(db, actor, workspaceId);
  const allowed = TEMPLATE_ORDER.filter((t) => can(role, TEMPLATES[t].manageAction));
  const [user] = await db.select().from(users).where(eq(users.id, actor.userId));

  await db
    .insert(automations)
    .values(
      allowed.map((template) => {
        const base = {
          template,
          enabled: TEMPLATES[template].defaultEnabled,
          config: resolveConfig(template, {}),
          timezone: user?.timezone ?? 'Asia/Seoul',
        };
        return { ...base, workspaceId, ownerId: actor.userId, nextRunAt: scheduleNext(base, now) };
      }),
    )
    .onConflictDoNothing();

  const rows = await db
    .select()
    .from(automations)
    .where(
      and(
        eq(automations.workspaceId, workspaceId),
        eq(automations.ownerId, actor.userId),
        inArray(automations.template, allowed),
      ),
    );
  const lastRuns = await latestRuns(
    db,
    rows.map((r) => r.id),
  );
  return rows
    .sort((a, b) => TEMPLATE_ORDER.indexOf(a.template) - TEMPLATE_ORDER.indexOf(b.template))
    .map((r) => {
      const config = resolveConfig(r.template, r.config);
      return {
        ...r,
        config,
        definition: describe(r.template, config),
        lastRun: lastRuns.get(r.id) ?? null,
      };
    });
}

export type AutomationView = Awaited<ReturnType<typeof listAutomations>>[number];

function describe(template: AutomationTemplate, config: Record<string, unknown>) {
  const d = TEMPLATES[template];
  const schedule = d.schedule(config);
  return {
    code: d.code,
    name: d.name,
    description: d.description,
    manualRun: d.manualRun,
    scheduleText: schedule ? describeSchedule(schedule) : '노트에서 요청할 때',
  };
}

async function latestRuns(db: Executor, ids: string[]) {
  const map = new Map<string, AutomationRun>();
  if (ids.length === 0) return map;
  const rows = await db
    .selectDistinctOn([automationRuns.automationId])
    .from(automationRuns)
    .where(inArray(automationRuns.automationId, ids))
    .orderBy(automationRuns.automationId, desc(automationRuns.startedAt));
  for (const r of rows) map.set(r.automationId, r);
  return map;
}

/** 본인 자동화만, 그리고 현재 그 템플릿을 설정할 권한이 있어야 한다 */
async function loadOwnAutomation(db: Executor, actor: Actor, id: string) {
  if (!isUuid(id)) throw new NotFoundError('자동화');
  const [a] = await db.select().from(automations).where(eq(automations.id, id));
  if (!a || a.ownerId !== actor.userId) throw new NotFoundError('자동화');
  await requireAccess(db, actor, a.workspaceId, TEMPLATES[a.template].manageAction);
  return a;
}

export async function updateAutomation(
  db: Executor,
  actor: Actor,
  id: string,
  input: { enabled?: boolean; config?: Record<string, unknown> },
  now = new Date(),
) {
  const current = await loadOwnAutomation(db, actor, id);
  let config = current.config;
  if (input.config) {
    const parsed = TEMPLATES[current.template].config.safeParse({
      ...current.config,
      ...input.config,
    });
    if (!parsed.success) {
      throw new ValidationError(
        `설정이 올바르지 않습니다: ${parsed.error.issues[0]?.message ?? ''}`,
      );
    }
    config = parsed.data as Record<string, unknown>;
  }
  const [user] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, actor.userId));
  const next = {
    ...current,
    config,
    enabled: input.enabled ?? current.enabled,
    timezone: user?.timezone ?? current.timezone,
  };
  const [updated] = await db
    .update(automations)
    .set({
      config,
      enabled: next.enabled,
      timezone: next.timezone,
      nextRunAt: scheduleNext(next, now),
    })
    .where(eq(automations.id, id))
    .returning();
  return updated!;
}

export async function listRuns(
  db: Executor,
  actor: Actor,
  input: { workspaceId: string; automationId?: string; limit?: number },
) {
  await roleIn(db, actor, input.workspaceId);
  return db
    .select({
      run: automationRuns,
      template: automations.template,
    })
    .from(automationRuns)
    .innerJoin(automations, eq(automations.id, automationRuns.automationId))
    .where(
      and(
        eq(automations.workspaceId, input.workspaceId),
        eq(automations.ownerId, actor.userId),
        input.automationId ? eq(automations.id, input.automationId) : undefined,
      ),
    )
    .orderBy(desc(automationRuns.startedAt))
    .limit(input.limit ?? 50)
    .then((rows) =>
      rows.map((r) => ({ ...r.run, template: r.template, name: TEMPLATES[r.template].name })),
    );
}

// ── 실행 엔진 ──────────────────────────────────────────────

type RunResult = { status: AutomationRun['status'] | 'duplicate'; runId?: string; error?: string };

/**
 * 실행 기록을 만든 뒤(같은 회차 키면 건너뜀) 본체를 실행한다.
 * - 데이터 변경은 한 트랜잭션: 실패하면 모두 되돌려 재시도가 깨끗하다
 * - 실행 시점에 권한을 다시 확인하고, 권한이 없으면 skipped
 */
export async function executeAutomation(
  db: Executor,
  automation: Automation,
  trigger: AutomationRun['trigger'],
  idempotencyKey: string,
  deps: EngineDeps,
  now = new Date(),
): Promise<RunResult> {
  const [run] = await db
    .insert(automationRuns)
    .values({ automationId: automation.id, trigger, idempotencyKey, startedAt: now })
    .onConflictDoNothing({ target: [automationRuns.automationId, automationRuns.idempotencyKey] })
    .returning();
  if (!run) return { status: 'duplicate' };
  return perform(db, automation, run, deps, now);
}

async function perform(
  db: Executor,
  automation: Automation,
  run: AutomationRun,
  deps: EngineDeps,
  now: Date,
): Promise<RunResult> {
  const def = TEMPLATES[automation.template];
  let outcome: RunOutcome;
  try {
    outcome = await db.transaction(async (tx) => {
      const actor = { userId: automation.ownerId };
      await requireAccess(tx, actor, automation.workspaceId, def.requiredAction);
      const [owner] = await tx.select().from(users).where(eq(users.id, automation.ownerId));
      if (!owner) throw new NotFoundError('사용자');
      const out = await def.run(
        {
          db: tx,
          automation,
          owner,
          actor,
          now,
          timeZone: automation.timezone,
          today: utcToLocalDate(now, automation.timezone),
          mailer: deps.mailer,
          appUrl: deps.appUrl,
        },
        resolveConfig(automation.template, automation.config),
      );
      if (out.state) {
        await tx
          .update(automations)
          .set({ state: { ...automation.state, ...out.state } })
          .where(eq(automations.id, automation.id));
      }
      return out;
    });
  } catch (err) {
    return recordFailure(db, automation, run, err, now);
  }

  await db
    .update(automationRuns)
    .set({
      status: 'succeeded',
      finishedAt: new Date(),
      inputSummary: outcome.input,
      result: outcome.result,
      error: null,
      nextRetryAt: null,
    })
    .where(eq(automationRuns.id, run.id));
  await db
    .update(automations)
    .set({ lastRunAt: now, failureCount: 0 })
    .where(eq(automations.id, automation.id));
  return { status: 'succeeded', runId: run.id };
}

async function recordFailure(
  db: Executor,
  automation: Automation,
  run: AutomationRun,
  err: unknown,
  now: Date,
): Promise<RunResult> {
  const message = err instanceof Error ? err.message : String(err);
  // 권한이 사라졌거나 대상이 없으면 재시도해도 소용없다
  if (err instanceof ForbiddenError || err instanceof NotFoundError) {
    await db
      .update(automationRuns)
      .set({ status: 'skipped', finishedAt: new Date(), error: message })
      .where(eq(automationRuns.id, run.id));
    return { status: 'skipped', runId: run.id, error: message };
  }

  const { maxAttempts, backoffSeconds } = automation.retryPolicy;
  const canRetry = run.attempt < maxAttempts && !(err instanceof DomainError);
  const nextRetryAt = canRetry
    ? new Date(now.getTime() + backoffSeconds * 1000 * 2 ** (run.attempt - 1))
    : null;
  await db
    .update(automationRuns)
    .set({ status: 'failed', finishedAt: new Date(), error: message, nextRetryAt })
    .where(eq(automationRuns.id, run.id));
  await db
    .update(automations)
    .set({ lastRunAt: now, failureCount: sql`${automations.failureCount} + 1` })
    .where(eq(automations.id, automation.id));
  if (!canRetry) {
    await notify(db, {
      userId: automation.ownerId,
      workspaceId: automation.workspaceId,
      type: 'automation.failed',
      title: `자동화 실패: ${TEMPLATES[automation.template].name}`,
      message: message.slice(0, 200),
      link: '/automations?tab=runs',
    });
  }
  return { status: 'failed', runId: run.id, error: message };
}

/** 실패한 실행을 같은 기록에서 다시 시도한다(attempt +1). 동시에 두 번 잡히지 않도록 상태로 선점한다. */
async function retryRun(
  db: Executor,
  runId: string,
  deps: EngineDeps,
  now: Date,
): Promise<RunResult> {
  const [claimed] = await db
    .update(automationRuns)
    .set({
      status: 'running',
      attempt: sql`${automationRuns.attempt} + 1`,
      startedAt: now,
      finishedAt: null,
      error: null,
      nextRetryAt: null,
    })
    .where(and(eq(automationRuns.id, runId), eq(automationRuns.status, 'failed')))
    .returning();
  if (!claimed) return { status: 'duplicate' };
  const [automation] = await db
    .select()
    .from(automations)
    .where(eq(automations.id, claimed.automationId));
  return perform(db, automation!, claimed, deps, now);
}

/** 예약 시각이 된 자동화 실행 (워커가 1분마다 호출) */
export async function runDueAutomations(db: Executor, deps: EngineDeps, now = new Date()) {
  const due = await db
    .select()
    .from(automations)
    .where(and(eq(automations.enabled, true), lte(automations.nextRunAt, now)))
    .orderBy(asc(automations.nextRunAt))
    .limit(100);

  const results: RunResult[] = [];
  for (const a of due) {
    const slot = a.nextRunAt!;
    // 다음 예약 시각으로 옮기면서 선점: 다른 워커가 먼저 옮겼으면 0행
    const [claimed] = await db
      .update(automations)
      .set({ nextRunAt: scheduleNext(a, now) })
      .where(and(eq(automations.id, a.id), eq(automations.nextRunAt, slot)))
      .returning();
    if (!claimed) continue;
    results.push(
      await executeAutomation(db, a, 'schedule', `schedule:${slot.toISOString()}`, deps, now),
    );
  }
  return results;
}

/** 재시도 시각이 된 실패 실행 재시도 (워커가 1분마다 호출) */
export async function retryFailedRuns(db: Executor, deps: EngineDeps, now = new Date()) {
  const due = await db
    .select({ id: automationRuns.id })
    .from(automationRuns)
    .where(
      and(
        eq(automationRuns.status, 'failed'),
        isNotNull(automationRuns.nextRetryAt),
        lte(automationRuns.nextRetryAt, now),
      ),
    )
    .limit(100);
  const results: RunResult[] = [];
  for (const r of due) results.push(await retryRun(db, r.id, deps, now));
  return results;
}

/** 사용자가 '지금 실행' */
export async function runAutomationNow(
  db: Executor,
  actor: Actor,
  automationId: string,
  deps: EngineDeps,
  now = new Date(),
) {
  const a = await loadOwnAutomation(db, actor, automationId);
  if (!TEMPLATES[a.template].manualRun) {
    throw new ValidationError('이 자동화는 직접 실행할 수 없습니다.');
  }
  return executeAutomation(db, a, 'manual', `manual:${randomUUID()}`, deps, now);
}

/** 사용자가 실패한 실행을 바로 재시도 */
export async function retryRunNow(
  db: Executor,
  actor: Actor,
  runId: string,
  deps: EngineDeps,
  now = new Date(),
) {
  if (!isUuid(runId)) throw new NotFoundError('실행 기록');
  const [run] = await db.select().from(automationRuns).where(eq(automationRuns.id, runId));
  if (!run) throw new NotFoundError('실행 기록');
  await loadOwnAutomation(db, actor, run.automationId);
  if (run.status !== 'failed') throw new ValidationError('실패한 실행만 재시도할 수 있습니다.');
  return retryRun(db, runId, deps, now);
}

/**
 * A05 메모에서 할 일 생성: 할 일은 항상 만들고, 자동화가 켜져 있으면 설정(마감일)을 적용하고 실행을 기록한다.
 */
export async function runNoteToTask(
  db: Executor,
  actor: Actor,
  noteId: string,
  title: string,
  now = new Date(),
) {
  const task = await createTaskFromNote(db, actor, noteId, { title });
  const [a] = await db
    .select()
    .from(automations)
    .where(
      and(
        eq(automations.workspaceId, task.workspaceId),
        eq(automations.ownerId, actor.userId),
        eq(automations.template, 'note_to_task'),
        eq(automations.enabled, true),
      ),
    );
  if (!a) return task;
  const config = resolveConfig('note_to_task', a.config) as { dueInDays: number | null };
  if (config.dueInDays !== null) {
    await updateTask(db, actor, task.id, {
      dueAt: addLocalDays(now, config.dueInDays, a.timezone),
    });
  }
  await db.insert(automationRuns).values({
    automationId: a.id,
    trigger: 'event',
    idempotencyKey: `note:${noteId}:task:${task.id}`,
    status: 'succeeded',
    startedAt: now,
    finishedAt: new Date(),
    inputSummary: { noteId },
    result: { taskId: task.id, dueInDays: config.dueInDays },
  });
  await db.update(automations).set({ lastRunAt: now }).where(eq(automations.id, a.id));
  return task;
}

/** 대시보드 자동화 위젯용 요약 */
export async function automationSummary(db: Executor, actor: Actor, workspaceId: string) {
  const list = await listAutomations(db, actor, workspaceId);
  return list
    .filter((a) => a.enabled)
    .map((a) => ({
      id: a.id,
      name: a.definition.name,
      nextRunAt: a.nextRunAt,
      lastStatus: a.lastRun?.status ?? null,
      lastRunAt: a.lastRun?.startedAt ?? null,
    }));
}
