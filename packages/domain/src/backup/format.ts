import { createHash } from 'node:crypto';
import { z } from 'zod';
import { schema } from '@myos/db';
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
    version: z.literal(1),
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
        count: tables[key].length,
        sha256: hash(
          [...tables[key]].sort((a, b) =>
            canonical(a) < canonical(b) ? -1 : canonical(a) > canonical(b) ? 1 : 0,
          ),
        ),
      },
    ]),
  );
}

function validateRelations(backup: BackupPayload) {
  const { tables: t, workspace } = backup;
  let total = 0;
  for (const key of BACKUP_TABLES) {
    total += t[key].length;
    const seen = new Set<string>();
    for (const row of t[key]) {
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
    event: new Set<string>(),
  };
  const ref = (id: string | null, set: Set<string>) => {
    if (id && !set.has(id)) throw new ValidationError('백업의 연결 정보가 올바르지 않습니다.');
  };
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
