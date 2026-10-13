import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, timestamps } from './_common';
import { users, workspaces } from './identity';
import { projects } from './work';

/** 자동화 템플릿 A01~A06 (기획서 §3) */
export const automationTemplate = pgEnum('automation_template', [
  'morning_briefing', // A01
  'deadline_alert', // A02
  'recurring_tasks', // A03
  'weekly_review', // A04
  'note_to_task', // A05
  'shared_change_alert', // A06
]);

export interface RetryPolicy {
  maxAttempts: number;
  /** 첫 재시도까지 대기(초). 이후 2배씩 늘어난다 */
  backoffSeconds: number;
}

/** 사용자가 공간에서 켜고 끄는 자동화 규칙. 템플릿당 하나. */
export const automations = pgTable(
  'automations',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    template: automationTemplate('template').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    /** 실행 기준 시간대 */
    timezone: text('timezone').notNull().default('Asia/Seoul'),
    /** 템플릿별 내부 상태 (예: A06의 마지막으로 처리한 활동 시각) */
    state: jsonb('state').$type<Record<string, unknown>>().notNull().default({}),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),
    failureCount: integer('failure_count').notNull().default(0),
    retryPolicy: jsonb('retry_policy')
      .$type<RetryPolicy>()
      .notNull()
      .default({ maxAttempts: 3, backoffSeconds: 300 }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('automations_owner_template_uq').on(t.workspaceId, t.ownerId, t.template),
    index('automations_due_idx')
      .on(t.nextRunAt)
      .where(sql`${t.enabled}`),
  ],
);

export const runStatus = pgEnum('automation_run_status', [
  'running',
  'succeeded',
  'failed',
  'skipped',
]);
export const runTrigger = pgEnum('automation_run_trigger', ['schedule', 'manual', 'event']);

/** 실행 기록 (기획서 §3: 시작·종료 시각, 상태, 입력 요약, 결과, 오류, 재시도 정보) */
export const automationRuns = pgTable(
  'automation_runs',
  {
    id: id(),
    automationId: uuid('automation_id')
      .notNull()
      .references(() => automations.id, { onDelete: 'cascade' }),
    trigger: runTrigger('trigger').notNull(),
    /** 같은 회차의 중복 실행 방지 키 (예: 예약 시각) */
    idempotencyKey: text('idempotency_key').notNull(),
    status: runStatus('status').notNull().default('running'),
    attempt: integer('attempt').notNull().default(1),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    inputSummary: jsonb('input_summary').$type<Record<string, unknown>>(),
    result: jsonb('result').$type<Record<string, unknown>>(),
    error: text('error'),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('automation_runs_idempotency_uq').on(t.automationId, t.idempotencyKey),
    index('automation_runs_automation_idx').on(t.automationId, t.startedAt),
    index('automation_runs_retry_idx')
      .on(t.nextRetryAt)
      .where(sql`${t.status} = 'failed'`),
  ],
);

/** 반복 할 일 시리즈. 회차는 tasks(series_id, occurrence_date)로 생성된다 */
export const taskSeries = pgTable(
  'task_series',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description'),
    priority: text('priority').notNull().default('none'),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    rule: jsonb('rule').$type<Record<string, unknown>>().notNull(),
    timezone: text('timezone').notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date'),
    /** 다음에 만들 회차 날짜 (YYYY-MM-DD) */
    nextOccurrence: text('next_occurrence'),
    active: boolean('active').notNull().default(true),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [index('task_series_workspace_idx').on(t.workspaceId, t.active)],
);
