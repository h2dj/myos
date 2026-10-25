import { financePlanOccurrences } from '@myos/core';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { schema } from '@myos/db';
import { lifeBalanceInputSchema } from '../life-balance';
import { ValidationError } from '../errors';

export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
export const MAX_BACKUP_ROWS = 100_000;
const uuid = z.uuid();
const nullableId = uuid.nullable();
const date = z.iso.datetime({ offset: true });
const nullableDate = date.nullable();
const timestamps = { createdAt: date, updatedAt: date };
const base = { id: uuid, workspaceId: uuid };
const work = { ...base, createdBy: nullableId, ...timestamps, deletedAt: nullableDate };
const name = z.string().min(1).max(200);
const day = z.iso.date();
const rule = z.discriminatedUnion('freq', [
  z.object({ freq: z.literal('daily') }).strict(),
  z
    .object({
      freq: z.literal('weekly'),
      byWeekday: z.array(z.number().int().min(0).max(6)).min(1),
    })
    .strict(),
  z.object({ freq: z.literal('monthly'), byMonthDay: z.number().int().min(1).max(31) }).strict(),
]);
const tablesSchema = z
  .object({
    financePlans: z
      .array(
        z
          .object({
            ...base,
            userId: uuid,
            ...timestamps,
            title: z.string().min(1).max(200),
            accountId: uuid,
            targetAccountId: nullableId,
            kind: z.enum(schema.financePlans.kind.enumValues),
            amount: z.string().regex(/^[1-9]\d{0,17}$/),
            frequency: z.enum(schema.financePlans.frequency.enumValues),
            startOn: day,
            endOn: day.nullable(),
            category: z.string().min(1).max(50),
            note: z.string().max(1000),
            pausedAt: nullableDate,
          })
          .strict(),
      )
      .optional(),
    financePlanOutcomes: z
      .array(
        z
          .object({
            ...base,
            userId: uuid,
            ...timestamps,
            planId: uuid,
            occurrenceOn: day,
            status: z.enum(['posted', 'skipped']),
            entryId: nullableId,
          })
          .strict(),
      )
      .optional(),
    financeComments: z
      .array(
        z
          .object({
            ...base,
            userId: uuid,
            ...timestamps,
            accountId: nullableId,
            budgetId: nullableId,
            body: z.string().min(1).max(3000),
          })
          .strict(),
      )
      .optional(),
    financeAccounts: z
      .array(
        z
          .object({
            ...base,
            userId: uuid,
            ...timestamps,
            name: z.string().min(1).max(100),
            description: z.string().max(5000).optional(),
            kind: z.enum(schema.financeAccounts.kind.enumValues),
            openingBalance: z.string().regex(/^-?(0|[1-9]\d{0,17})$/),
            archivedAt: nullableDate,
          })
          .strict(),
      )
      .optional(),
    financeEntries: z
      .array(
        z
          .object({
            ...base,
            userId: uuid,
            ...timestamps,
            deletedAt: nullableDate,
            accountId: uuid,
            targetAccountId: nullableId,
            kind: z.enum(schema.financeEntries.kind.enumValues),
            amount: z.string().regex(/^[1-9]\d{0,17}$/),
            occurredOn: day,
            category: z.string().min(1).max(50),
            note: z.string().max(1000),
          })
          .strict(),
      )
      .optional(),
    financeBudgets: z
      .array(
        z
          .object({
            ...base,
            userId: uuid,
            ...timestamps,
            month: day.refine((value) => value.endsWith('-01')),
            description: z.string().max(5000).optional(),
            category: z.string().min(1).max(50),
            amount: z.string().regex(/^(0|[1-9]\d{0,17})$/),
          })
          .strict(),
      )
      .optional(),
    lifeReviews: z
      .array(
        z
          .object({
            ...base,
            userId: uuid,
            createdAt: date,
            snapshot: z
              .object({
                version: z.union([z.literal(1), z.literal(2)]),
                input: lifeBalanceInputSchema,
                timeZone: z.string().refine((tz) => {
                  try {
                    new Intl.DateTimeFormat('en', { timeZone: tz });
                    return true;
                  } catch {
                    return false;
                  }
                }),
                areas: z
                  .array(
                    z
                      .object({
                        id: z.string(),
                        label: z.string(),
                        selfScore: z.number().min(0).max(10),
                        completed: z.number().int().min(0),
                        target: z.number().int().min(1),
                        activityScore: z.number().min(0).max(10).nullable(),
                        combined: z.number().min(0).max(10),
                      })
                      .strict(),
                  )
                  .min(1)
                  .max(8),
                selfScore: z.number().min(0).max(10),
                activityScore: z.number().min(0).max(10).nullable(),
                combined: z.number().min(0).max(10),
                totalCompleted: z.number().int().min(0),
                unclassified: z.number().int().min(0),
                conflicts: z.number().int().min(0),
              })
              .strict(),
          })
          .strict(),
      )
      .optional(),
    externalRefs: z
      .array(
        z
          .object({
            ...base,
            provider: z.literal('notion'),
            externalId: z.string().regex(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/),
            entityType: z.enum(['task', 'project', 'activity', 'place']),
            entityId: uuid,
            sourceUpdatedAt: nullableDate,
            sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
            raw: z.record(z.string(), z.unknown()),
            mapping: z.record(z.string(), z.unknown()),
            importedAt: date,
          })
          .strict(),
      )
      .optional(),
    places: z.array(z.object({ ...work, name, description: z.string().nullable() }).strict()),
    activities: z.array(
      z.object({ ...work, name, description: z.string().nullable(), placeId: nullableId }).strict(),
    ),
    projects: z.array(
      z
        .object({
          ...work,
          name,
          description: z.string().nullable(),
          parentId: nullableId,
          status: z.enum(schema.projects.status.enumValues),
          startAt: nullableDate,
          dueAt: nullableDate,
        })
        .strict(),
    ),
    series: z.array(
      z
        .object({
          ...base,
          createdBy: nullableId,
          ...timestamps,
          projectId: nullableId,
          activityId: nullableId,
          activityPlaceId: nullableId,
          title: z.string().max(300),
          description: z.string().nullable(),
          priority: z.enum(schema.tasks.priority.enumValues),
          tags: z.array(z.string()),
          rule,
          timezone: z.string().refine((tz) => {
            try {
              new Intl.DateTimeFormat('en', { timeZone: tz });
              return true;
            } catch {
              return false;
            }
          }),
          startDate: day,
          endDate: day.nullable(),
          nextOccurrence: day.nullable(),
          active: z.boolean(),
        })
        .strict(),
    ),
    tasks: z.array(
      z
        .object({
          ...work,
          title: z.string().max(300),
          description: z.string().nullable(),
          projectId: nullableId,
          activityId: nullableId,
          activityPlaceId: nullableId,
          status: z.enum(schema.tasks.status.enumValues),
          priority: z.enum(schema.tasks.priority.enumValues),
          scheduledStart: nullableDate,
          scheduledEnd: nullableDate,
          allDay: z.boolean(),
          dueAt: nullableDate,
          completedAt: nullableDate,
          assigneeId: nullableId,
          sortOrder: z.number().int(),
          seriesId: nullableId,
          occurrenceDate: day.nullable(),
        })
        .strict(),
    ),
    notes: z.array(
      z
        .object({
          ...work,
          title: z.string(),
          content: z.string(),
          projectId: nullableId,
          type: z.enum(schema.notes.type.enumValues),
          isFavorite: z.boolean(),
        })
        .strict(),
    ),
    inbox: z.array(
      z
        .object({
          ...base,
          ...timestamps,
          createdBy: nullableId,
          content: z.string(),
          source: z.enum(schema.inboxItems.source.enumValues),
          processedAt: nullableDate,
          result: z.enum(schema.inboxItems.result.enumValues).nullable(),
          resultId: nullableId,
        })
        .strict(),
    ),
    tags: z.array(
      z.object({ ...base, ...timestamps, name: z.string(), color: z.string() }).strict(),
    ),
    entityTags: z.array(
      z
        .object({
          tagId: uuid,
          entityType: z.enum(schema.entityTags.entityType.enumValues),
          entityId: uuid,
          createdAt: date,
        })
        .strict(),
    ),
    links: z.array(
      z
        .object({
          ...base,
          sourceType: z.enum(schema.entityLinks.sourceType.enumValues),
          sourceId: uuid,
          targetType: z.enum(schema.entityLinks.targetType.enumValues),
          targetId: uuid,
          linkType: z.enum(schema.entityLinks.linkType.enumValues),
          createdAt: date,
        })
        .strict(),
    ),
  })
  .strict();
const payloadSchema = z
  .object({
    format: z.literal('myos-workspace'),
    version: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
    ]),
    exportedAt: date,
    workspace: z
      .object({
        id: uuid,
        ownerId: uuid,
        name,
        type: z.enum(schema.workspaces.type.enumValues),
        ...timestamps,
        deletedAt: z.null(),
      })
      .strict(),
    tables: tablesSchema,
  })
  .strict();
export type BackupPayload = z.infer<typeof payloadSchema>;
export type BackupTables = BackupPayload['tables'];
export type WorkspaceBackup = BackupPayload & { sha256: string };
export const BACKUP_TABLES = [
  'financePlans',
  'financePlanOutcomes',
  'financeComments',
  'financeAccounts',
  'financeEntries',
  'financeBudgets',
  'lifeReviews',
  'externalRefs',
  'places',
  'activities',
  'projects',
  'series',
  'tasks',
  'notes',
  'inbox',
  'tags',
  'entityTags',
  'links',
] as const;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function hash(value: unknown) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}
export function backupTableSummary(tables: BackupTables) {
  return Object.fromEntries(
    BACKUP_TABLES.map((key) => [
      key,
      {
        count: (tables[key] ?? []).length,
        sha256: hash(
          [...(tables[key] ?? [])]
            .map((row) =>
              key === 'financeAccounts' || key === 'financeBudgets'
                ? { ...row, description: (row as { description?: string }).description ?? '' }
                : row,
            )
            .sort((a, b) =>
              canonical(a) < canonical(b) ? -1 : canonical(a) > canonical(b) ? 1 : 0,
            ),
        ),
      },
    ]),
  );
}

function validateRelations(backup: BackupPayload) {
  const { tables: t, workspace } = backup;
  if (
    (backup.version === 1 && t.externalRefs !== undefined) ||
    (backup.version >= 2 && t.externalRefs === undefined) ||
    (backup.version < 3 && t.lifeReviews !== undefined) ||
    (backup.version >= 3 && t.lifeReviews === undefined) ||
    (backup.version < 4 &&
      (t.financeAccounts !== undefined ||
        t.financeEntries !== undefined ||
        t.financeBudgets !== undefined)) ||
    (backup.version >= 4 &&
      (t.financeAccounts === undefined ||
        t.financeEntries === undefined ||
        t.financeBudgets === undefined))
  )
    throw new ValidationError('백업 버전과 가져오기 이력 형식이 일치하지 않습니다.');
  if (
    (backup.version < 5 && t.financeComments !== undefined) ||
    (backup.version >= 5 && t.financeComments === undefined)
  )
    throw new ValidationError('백업 버전과 추가 메모 형식이 일치하지 않습니다.');
  if (
    backup.version >= 5 &&
    [...(t.financeAccounts ?? []), ...(t.financeBudgets ?? [])].some(
      (row) => row.description === undefined,
    )
  )
    throw new ValidationError('재정 설명이 누락되어 있습니다.');
  if (
    (backup.version < 6 && (t.financePlans !== undefined || t.financePlanOutcomes !== undefined)) ||
    (backup.version === 6 && (t.financePlans === undefined || t.financePlanOutcomes === undefined))
  )
    throw new ValidationError('백업 버전과 예정 형식이 일치하지 않습니다.');
  for (const review of t.lifeReviews ?? []) {
    if (workspace.type !== 'personal' || review.userId !== workspace.ownerId)
      throw new ValidationError('개인 회고의 소유자 정보가 올바르지 않습니다.');
  }
  for (const row of [
    ...(t.financeAccounts ?? []),
    ...(t.financePlans ?? []),
    ...(t.financePlanOutcomes ?? []),
    ...(t.financeComments ?? []),
    ...(t.financeEntries ?? []),
    ...(t.financeBudgets ?? []),
  ]) {
    if (workspace.type !== 'personal' || row.userId !== workspace.ownerId)
      throw new ValidationError('재정 데이터의 소유자 정보가 올바르지 않습니다.');
  }
  const sources = new Set<string>();
  for (const ref of t.externalRefs ?? []) {
    const key = `${ref.provider}:${ref.externalId}`;
    if (sources.has(key)) throw new ValidationError('가져오기 원본 ID가 중복되어 있습니다.');
    sources.add(key);
  }
  let total = 0;
  for (const key of BACKUP_TABLES) {
    total += (t[key] ?? []).length;
    const seen = new Set<string>();
    for (const row of t[key] ?? []) {
      if ('workspaceId' in row && row.workspaceId !== workspace.id)
        throw new ValidationError('다른 공간의 데이터가 포함되어 있습니다.');
      const id = 'id' in row ? row.id : `${row.tagId}:${row.entityType}:${row.entityId}`;
      if (seen.has(id)) throw new ValidationError('중복된 데이터가 포함되어 있습니다.');
      seen.add(id);
    }
  }
  if (total > MAX_BACKUP_ROWS) throw new ValidationError('백업 행 수 제한을 초과했습니다.');
  const ids = (rows: { id: string }[]) => new Set(rows.map((r) => r.id));
  const projects = ids(t.projects),
    places = ids(t.places),
    activities = ids(t.activities),
    series = ids(t.series),
    tags = ids(t.tags);
  const entities = {
    task: ids(t.tasks),
    project: projects,
    note: ids(t.notes),
    activity: activities,
    place: places,
    event: new Set<string>(),
  };
  const ref = (id: string | null, set: Set<string>) => {
    if (id && !set.has(id)) throw new ValidationError('백업의 연결 정보가 올바르지 않습니다.');
  };
  const financialAccounts = ids(t.financeAccounts ?? []);
  for (const entry of t.financeEntries ?? []) {
    ref(entry.accountId, financialAccounts);
    ref(entry.targetAccountId, financialAccounts);
    if (
      entry.kind === 'transfer'
        ? !entry.targetAccountId || entry.targetAccountId === entry.accountId
        : entry.targetAccountId !== null
    )
      throw new ValidationError('재정 거래의 계좌 연결이 올바르지 않습니다.');
  }
  const planMap = new Map((t.financePlans ?? []).map((p) => [p.id, p]));
  const entryIds = ids(t.financeEntries ?? []);
  const occurrenceKeys = new Set<string>();
  const postedEntries = new Set<string>();
  for (const plan of t.financePlans ?? []) {
    ref(plan.accountId, financialAccounts);
    ref(plan.targetAccountId, financialAccounts);
    if (
      (plan.endOn && plan.endOn < plan.startOn) ||
      (plan.kind === 'transfer'
        ? !plan.targetAccountId || plan.targetAccountId === plan.accountId
        : plan.targetAccountId !== null)
    )
      throw new ValidationError('예정 규칙의 날짜·계좌 연결이 올바르지 않습니다.');
  }
  for (const outcome of t.financePlanOutcomes ?? []) {
    const plan = planMap.get(outcome.planId);
    const key = `${outcome.planId}:${outcome.occurrenceOn}`;
    if (
      !plan ||
      !financePlanOccurrences({ ...plan, endOn: null }, outcome.occurrenceOn, outcome.occurrenceOn)
        .length ||
      occurrenceKeys.has(key)
    )
      throw new ValidationError('예정 회차가 중복되거나 올바르지 않습니다.');
    occurrenceKeys.add(key);
    ref(outcome.entryId, entryIds);
    if (outcome.status === 'posted' && !outcome.entryId)
      throw new ValidationError('확정 거래가 누락되어 있습니다.');
    if (outcome.entryId) {
      if (postedEntries.has(outcome.entryId))
        throw new ValidationError('확정 거래가 중복 연결되어 있습니다.');
      postedEntries.add(outcome.entryId);
    }
  }
  const financialBudgets = ids(t.financeBudgets ?? []);
  for (const comment of t.financeComments ?? []) {
    if ((comment.accountId === null) === (comment.budgetId === null))
      throw new ValidationError('추가 메모 대상은 하나여야 합니다.');
    ref(comment.accountId, financialAccounts);
    ref(comment.budgetId, financialBudgets);
  }
  const budgetKeys = new Set<string>();
  for (const budget of t.financeBudgets ?? []) {
    const key = `${budget.month}:${budget.category}`;
    if (budgetKeys.has(key)) throw new ValidationError('월별 카테고리 예산이 중복되어 있습니다.');
    budgetKeys.add(key);
  }
  const taskRefs = (r: {
    projectId: string | null;
    activityId: string | null;
    activityPlaceId: string | null;
  }) => {
    ref(r.projectId, projects);
    ref(r.activityId, activities);
    ref(r.activityPlaceId, places);
  };
  for (const a of t.activities) ref(a.placeId, places);
  const parents = new Map(t.projects.map((p) => [p.id, p.parentId]));
  const checkedParents = new Set<string>();
  for (const p of t.projects) {
    ref(p.parentId, projects);
    const seen = new Set<string>();
    let id: string | null = p.id;
    while (id && !checkedParents.has(id)) {
      if (seen.has(id)) throw new ValidationError('프로젝트 계층에 순환이 있습니다.');
      seen.add(id);
      id = parents.get(id) ?? null;
    }
    for (const visited of seen) checkedParents.add(visited);
  }
  const occurrences = new Set<string>();
  for (const task of t.tasks) {
    taskRefs(task);
    ref(task.seriesId, series);
    if (task.seriesId && task.occurrenceDate) {
      const key = `${task.seriesId}:${task.occurrenceDate}`;
      if (occurrences.has(key)) throw new ValidationError('반복 회차가 중복되어 있습니다.');
      occurrences.add(key);
    }
    if (
      task.scheduledStart &&
      task.scheduledEnd &&
      Date.parse(task.scheduledEnd) < Date.parse(task.scheduledStart)
    )
      throw new ValidationError('일정 기간이 올바르지 않습니다.');
  }
  for (const s of t.series) taskRefs(s);
  for (const n of t.notes) ref(n.projectId, projects);
  for (const tag of t.entityTags) {
    ref(tag.tagId, tags);
    ref(tag.entityId, entities[tag.entityType]);
  }
  const names = new Set<string>();
  for (const tag of t.tags) {
    if (names.has(tag.name)) throw new ValidationError('태그 이름이 중복되어 있습니다.');
    names.add(tag.name);
  }
  const links = new Set<string>();
  for (const l of t.links) {
    ref(l.sourceId, entities[l.sourceType]);
    ref(l.targetId, entities[l.targetType]);
    const key = `${l.sourceType}:${l.sourceId}:${l.targetType}:${l.targetId}:${l.linkType}`;
    if (links.has(key)) throw new ValidationError('연결이 중복되어 있습니다.');
    links.add(key);
  }
  // 처리된 인박스의 resultId는 영구 삭제된 항목의 과거 참조일 수 있어 그대로 보존한다.
}
export function sealWorkspaceBackup(input: unknown): WorkspaceBackup {
  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success)
    throw new ValidationError('지원하지 않는 백업 형식 또는 잘못된 데이터입니다.');
  validateRelations(parsed.data);
  return { ...parsed.data, sha256: hash(parsed.data) };
}
export function parseWorkspaceBackup(text: string): WorkspaceBackup {
  if (Buffer.byteLength(text, 'utf8') > MAX_BACKUP_BYTES)
    throw new ValidationError('백업 파일은 20MiB 이하여야 합니다.');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ValidationError('JSON 백업 파일을 읽을 수 없습니다.');
  }
  const envelope = payloadSchema
    .extend({ sha256: z.string().regex(/^[a-f0-9]{64}$/) })
    .safeParse(value);
  if (!envelope.success)
    throw new ValidationError('지원하지 않는 백업 형식 또는 잘못된 데이터입니다.');
  const { sha256, ...payload } = envelope.data;
  const validated = sealWorkspaceBackup(payload);
  if (validated.sha256 !== sha256) throw new ValidationError('백업 체크섬이 일치하지 않습니다.');
  return validated;
}
