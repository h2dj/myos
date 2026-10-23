import { NOTION_FIELDS } from '@myos/core';
import { schema } from '@myos/db';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { requireAccess } from '../access';
import { createActivity, createActivityPlace } from '../activities';
import { createProject } from '../projects';
import { createTask } from '../tasks';
import type { Actor, Executor } from '../context';
import { DomainError, ValidationError } from '../errors';
import { parse } from '../validation';
import { readNotionFile } from './file';
import {
  importHash,
  mapNotionFile,
  requestSchema,
  type MappedNotionRow,
  type NotionMapping,
  type NotionRequest,
} from './mapping';

const { externalRefs } = schema;
const tables = {
  task: schema.tasks,
  project: schema.projects,
  activity: schema.activities,
  place: schema.activityPlaces,
};
const relationKinds = {
  parent: 'project',
  project: 'project',
  activity: 'activity',
  place: 'place',
} as const;
type Kind = NotionMapping['kind'];
type Ref = typeof externalRefs.$inferSelect;
export type NotionPreviewRow = {
  index: number;
  title: string;
  sourceId: string;
  disposition: 'new' | 'duplicate' | 'changed' | 'error';
  message: string;
  referenceNames?: Record<string, string>;
  values?: Omit<MappedNotionRow, 'raw' | 'sourceHash'>;
};
export type NotionPreview = { digest: string; rows: NotionPreviewRow[]; ignoredColumns: string[] };
export function inspectNotionFile(text: string, format: 'csv' | 'json') {
  return readNotionFile(text, format).columns;
}
async function loadRefs(db: Executor, workspaceId: string, ids: string[]) {
  const rows = ids.length
    ? await db
        .select()
        .from(externalRefs)
        .where(
          and(
            eq(externalRefs.workspaceId, workspaceId),
            eq(externalRefs.provider, 'notion'),
            inArray(externalRefs.externalId, ids),
          ),
        )
    : [];
  return new Map(rows.map((r) => [r.externalId, r]));
}
async function activeTargets(db: Executor, workspaceId: string, refs: Map<string, Ref>) {
  const active = new Map<string, string>();
  for (const kind of Object.keys(tables) as Kind[]) {
    const table = tables[kind];
    const ids = [...refs.values()].filter((r) => r.entityType === kind).map((r) => r.entityId);
    if (!ids.length) continue;
    const title =
      kind === 'task'
        ? schema.tasks.title
        : kind === 'project'
          ? schema.projects.name
          : kind === 'activity'
            ? schema.activities.name
            : schema.activityPlaces.name;
    const rows = await db
      .select({ id: table.id, title })
      .from(table)
      .where(
        and(eq(table.workspaceId, workspaceId), isNull(table.deletedAt), inArray(table.id, ids)),
      );
    for (const r of rows) active.set(`${kind}:${r.id}`, r.title);
  }
  return active;
}
async function prepare(db: Executor, workspaceId: string, input: NotionRequest, timeZone: string) {
  const mapped = mapNotionFile(input, timeZone);
  const valid = mapped.flatMap((m) => (m.row ? [m.row] : []));
  const refs = await loadRefs(db, workspaceId, [
    ...new Set(valid.flatMap((r) => [r.sourceId, ...Object.values(r.refs)])),
  ]);
  const active = await activeTargets(db, workspaceId, refs);
  const counts = new Map<string, number>();
  for (const row of valid) counts.set(row.sourceId, (counts.get(row.sourceId) ?? 0) + 1);
  const sourceRows = new Map(valid.map((r) => [r.sourceId, r]));
  const rows: NotionPreviewRow[] = mapped.map((m) => {
    if (!m.row)
      return {
        index: m.index,
        title: m.title ?? '',
        sourceId: '',
        disposition: 'error',
        message: m.error!,
      };
    const row = m.row;
    const { raw: _raw, sourceHash: _hash, ...values } = row;
    void _raw;
    void _hash;
    const referenceNames = Object.fromEntries(
      Object.entries(row.refs).map(([key, id]) => {
        const ref = refs.get(id);
        return [
          key,
          ref
            ? (active.get(`${ref.entityType}:${ref.entityId}`) ?? '삭제된 대상')
            : (sourceRows.get(id)?.title ?? '대상 확인 필요'),
        ];
      }),
    );
    const base = {
      index: row.index,
      title: row.title,
      sourceId: row.sourceId,
      values,
      referenceNames,
    };
    if (counts.get(row.sourceId)! > 1)
      return {
        ...base,
        disposition: 'error',
        message: '파일 안에 같은 페이지 ID가 여러 번 있습니다.',
      };
    const existing = refs.get(row.sourceId);
    if (existing) {
      if (existing.entityType !== input.mapping.kind)
        return { ...base, disposition: 'error', message: '이미 다른 종류로 가져온 페이지입니다.' };
      return {
        ...base,
        disposition: existing.sourceHash === row.sourceHash ? 'duplicate' : 'changed',
        message:
          existing.sourceHash === row.sourceHash
            ? '이미 가져온 원본입니다. 삭제된 대상도 다시 만들지 않습니다.'
            : '원본 또는 매핑이 변경되었습니다. 기존 내용을 보호하며 덮어쓰지 않습니다.',
      };
    }
    for (const [key, sourceId] of Object.entries(row.refs) as [
      keyof typeof relationKinds,
      string,
    ][]) {
      const kind = relationKinds[key],
        ref = refs.get(sourceId);
      if (ref) {
        if (ref.entityType !== kind || !active.has(`${kind}:${ref.entityId}`))
          return {
            ...base,
            disposition: 'error',
            message: `${NOTION_FIELDS[key].replace(' 원본 ID', '')}: 연결할 원본의 종류가 다르거나 대상이 삭제되었습니다.`,
          };
      } else if (!(
        key === 'parent' &&
        input.mapping.kind === 'project' &&
        sourceRows.has(sourceId)
      )) {
        return {
          ...base,
          disposition: 'error',
          message: `${NOTION_FIELDS[key].replace(' 원본 ID', '')}: 연결할 원본을 현재 공간에 먼저 가져오세요. 이름이 아닌 Notion 페이지 ID로 연결합니다.`,
        };
      }
    }
    if (input.mapping.kind === 'project') {
      const seen = new Set([row.sourceId]);
      let parent = row.refs.parent;
      while (parent && !refs.has(parent)) {
        if (seen.has(parent))
          return { ...base, disposition: 'error', message: '상위 프로젝트 관계가 순환합니다.' };
        seen.add(parent);
        parent = sourceRows.get(parent)?.refs.parent;
      }
    }
    return { ...base, disposition: 'new', message: '새로 저장할 항목입니다.' };
  });
  // A new child cannot depend on an invalid/changed parent in this file.
  let changed = true;
  while (changed) {
    changed = false;
    for (const preview of rows) {
      const parent = preview.values?.refs.parent;
      if (
        preview.disposition === 'new' &&
        parent &&
        !refs.has(parent) &&
        !rows.some((p) => p.sourceId === parent && p.disposition === 'new')
      ) {
        preview.disposition = 'error';
        preview.message = '상위 프로젝트의 오류를 먼저 수정하세요.';
        changed = true;
      }
    }
  }
  const used = new Set(Object.values(input.mapping.columns));
  return {
    mapped: valid,
    refs,
    preview: {
      digest: importHash({ workspaceId, input, timeZone }),
      rows,
      ignoredColumns: readNotionFile(input.text, input.format).columns.filter((c) => !used.has(c)),
    } satisfies NotionPreview,
  };
}
export async function previewNotionImport(
  db: Executor,
  actor: Actor,
  workspaceId: string,
  input: NotionRequest,
  timeZone: string,
) {
  await requireAccess(db, actor, workspaceId, 'manage');
  const request = parse(requestSchema, input);
  return (await prepare(db, workspaceId, request, timeZone)).preview;
}
const commitSchema = z
  .object({
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    selected: z.array(z.number().int().min(0).max(199)).min(1).max(10),
  })
  .strict();
export type NotionImportSummary = {
  created: number;
  skipped: number;
  failed: number;
  rows: { index: number; outcome: 'created' | 'skipped' | 'failed'; message: string }[];
};
export async function importNotionSample(
  db: Executor,
  actor: Actor,
  workspaceId: string,
  input: NotionRequest,
  timeZone: string,
  approval: z.input<typeof commitSchema>,
): Promise<NotionImportSummary> {
  const request = parse(requestSchema, input),
    approved = parse(commitSchema, approval);
  if (new Set(approved.selected).size !== approved.selected.length)
    throw new ValidationError('선택한 행이 중복되었습니다.');
  return db.transaction(async (tx) => {
    await requireAccess(tx, actor, workspaceId, 'manage');
    // Serializes imports in this workspace; source identity also has a database UNIQUE constraint.
    await tx.execute(sql`select id from ${schema.workspaces} where id = ${workspaceId} for update`);
    const plan = await prepare(tx, workspaceId, request, timeZone);
    if (approved.digest !== plan.preview.digest)
      throw new ValidationError(
        '파일·매핑·공간·시간대가 변경되었습니다. 다시 미리보기를 확인하세요.',
      );
    if (approved.selected.some((i) => !plan.preview.rows.some((r) => r.index === i)))
      throw new ValidationError('선택한 행을 찾을 수 없습니다.');
    const summary: NotionImportSummary = { created: 0, skipped: 0, failed: 0, rows: [] };
    const finish = (index: number, outcome: 'created' | 'skipped' | 'failed', message: string) => {
      summary[outcome]++;
      summary.rows.push({ index, outcome, message });
    };
    const pending = approved.selected.map((i) => plan.preview.rows.find((r) => r.index === i)!);
    while (pending.length) {
      let progressed = false;
      for (const preview of [...pending]) {
        if (preview.disposition !== 'new') {
          finish(
            preview.index,
            preview.disposition === 'error' ? 'failed' : 'skipped',
            preview.message,
          );
        } else {
          const row = plan.mapped.find((r) => r.index === preview.index)!;
          if (
            row.refs.parent &&
            !plan.refs.has(row.refs.parent) &&
            pending.some((p) => p.sourceId === row.refs.parent && p.index !== row.index)
          )
            continue;
          try {
            const ref = await tx.transaction(async (rowTx) => {
              const resolve = (key: keyof typeof relationKinds) => {
                const sourceId = row.refs[key];
                if (!sourceId) return null;
                const ref = plan.refs.get(sourceId);
                if (!ref || ref.entityType !== relationKinds[key])
                  throw new ValidationError(
                    `${NOTION_FIELDS[key].replace(' 원본 ID', '')}: 연결할 항목을 먼저 가져오거나 이번 표본에 함께 선택하세요.`,
                  );
                return ref.entityId;
              };
              const common = { workspaceId, name: row.title, description: row.description };
              let entityId: string;
              if (request.mapping.kind === 'place')
                entityId = (await createActivityPlace(rowTx, actor, common)).id;
              else if (request.mapping.kind === 'activity')
                entityId = (
                  await createActivity(rowTx, actor, { ...common, placeId: resolve('place') })
                ).id;
              else if (request.mapping.kind === 'project')
                entityId = (
                  await createProject(rowTx, actor, { ...common, parentId: resolve('parent') })
                ).id;
              else {
                const task = await createTask(rowTx, actor, {
                  workspaceId,
                  title: row.title,
                  description: row.description,
                  status: row.status,
                  priority: row.priority,
                  tags: row.tags,
                  projectId: resolve('project'),
                  activityId: resolve('activity'),
                  activityPlaceId: resolve('place'),
                  scheduledStart: row.scheduledStart ? new Date(row.scheduledStart) : null,
                  scheduledEnd: row.scheduledEnd ? new Date(row.scheduledEnd) : null,
                  dueAt: row.dueAt ? new Date(row.dueAt) : null,
                  allDay: row.allDay,
                });
                entityId = task.id;
                await rowTx
                  .update(schema.tasks)
                  .set({ completedAt: row.completedAt ? new Date(row.completedAt) : null })
                  .where(eq(schema.tasks.id, entityId));
              }
              if (row.createdAt) {
                const table = tables[request.mapping.kind];
                await rowTx
                  .update(table)
                  .set({ createdAt: new Date(row.createdAt) })
                  .where(eq(table.id, entityId));
              }
              const [ref] = await rowTx
                .insert(externalRefs)
                .values({
                  workspaceId,
                  provider: 'notion',
                  externalId: row.sourceId,
                  entityType: request.mapping.kind,
                  entityId,
                  sourceUpdatedAt: row.sourceUpdatedAt ? new Date(row.sourceUpdatedAt) : null,
                  sourceHash: row.sourceHash,
                  raw: row.raw,
                  mapping: { ...request.mapping, timeZone },
                })
                .returning();
              return ref!;
            });
            plan.refs.set(row.sourceId, ref);
            finish(row.index, 'created', '저장했습니다. 원본과 매핑을 함께 보존했습니다.');
          } catch (e) {
            if (!(e instanceof DomainError)) throw e;
            finish(row.index, 'failed', e.message);
          }
        }
        pending.splice(pending.indexOf(preview), 1);
        progressed = true;
      }
      if (!progressed) {
        for (const row of pending)
          finish(row.index, 'failed', '프로젝트 관계의 순환 또는 누락을 확인하세요.');
        break;
      }
    }
    summary.rows.sort((a, b) => a.index - b.index);
    return summary;
  });
}
