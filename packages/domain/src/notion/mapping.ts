import { NOTION_FIELDS, notionFieldsFor, type NotionField } from '@myos/core';
import { createHash } from 'node:crypto';
import { localDateToUtc } from '@myos/core';
import { z } from 'zod';
import { ValidationError } from '../errors';
import { parse } from '../validation';
import { tagNamesSchema } from '../tags';
import { notionPageId, readNotionFile } from './file';

export const mappingSchema = z
  .object({
    kind: z.enum(['task', 'project', 'activity', 'place']),
    columns: z.partialRecord(
      z.enum(Object.keys(NOTION_FIELDS) as [NotionField, ...NotionField[]]),
      z.string().max(200),
    ),
  })
  .strict();
export type NotionMapping = z.infer<typeof mappingSchema>;
export const requestSchema = z
  .object({ text: z.string(), format: z.enum(['csv', 'json']), mapping: mappingSchema })
  .strict();
export type NotionRequest = z.infer<typeof requestSchema>;
export type MappedNotionRow = {
  index: number;
  sourceId: string;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'done' | 'cancelled';
  priority: 'none' | 'low' | 'medium' | 'high';
  tags: string[];
  scheduledStart: string | null;
  scheduledEnd: string | null;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string | null;
  sourceUpdatedAt: string | null;
  allDay: boolean;
  refs: Partial<Record<'parent' | 'project' | 'activity' | 'place', string>>;
  warnings: string[];
  raw: Record<string, unknown>;
  sourceHash: string;
};
export const importHash = (v: unknown): string => {
  const canonical = (v: unknown): string =>
    Array.isArray(v)
      ? `[${v.map(canonical).join(',')}]`
      : v && typeof v === 'object'
        ? `{${Object.entries(v)
            .sort(([a], [b]) => a.localeCompare(b, 'en'))
            .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
            .join(',')}}`
        : JSON.stringify(v);
  return createHash('sha256').update(canonical(v)).digest('hex');
};
const fail = (message: string): never => {
  throw new ValidationError(message);
};
export function tokens(value: string) {
  if (!value.trim()) return [];
  if (value.trim().startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string'))
        return parsed as string[];
    } catch {
      /* validation below */
    }
    return fail('태그·관계 배열 형식을 확인하세요.');
  }
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
function date(value: string, timeZone: string, endOfDay = false): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (!z.iso.date().safeParse(value).success) return fail('날짜는 유효한 YYYY-MM-DD여야 합니다.');
    if (!endOfDay) return localDateToUtc(value, timeZone).toISOString();
    const nextDay = new Date(Date.parse(value) + 86_400_000).toISOString().slice(0, 10);
    return new Date(localDateToUtc(nextDay, timeZone).getTime() - 1).toISOString();
  }
  if (!z.iso.datetime({ offset: true }).safeParse(value).success)
    return fail('일시는 시간대가 있는 ISO 형식, 날짜는 YYYY-MM-DD로 입력하세요.');
  return new Date(value).toISOString();
}
export function mapNotionFile(input: NotionRequest, timeZone: string) {
  const request = parse(requestSchema, input);
  const file = readNotionFile(request.text, request.format);
  for (const [field, column] of Object.entries(request.mapping.columns)) {
    if (
      column &&
      (!file.columns.includes(column) ||
        !notionFieldsFor(request.mapping.kind).some((allowed) => allowed === field))
    )
      fail('매핑 속성이나 가져올 종류를 다시 확인하세요.');
  }
  if (!request.mapping.columns.sourceId || !request.mapping.columns.title)
    fail('페이지 ID와 제목 속성을 선택하세요.');
  return file.rows.map(
    (
      { raw, cells },
      index,
    ): { row?: MappedNotionRow; index: number; error?: string; title?: string } => {
      try {
        if (raw.archived === true || raw.in_trash === true)
          fail('Notion 휴지통 항목은 가져오지 않습니다.');
        const get = (key: NotionField) => {
          const column = request.mapping.columns[key] ?? '';
          return Object.hasOwn(cells, column) ? cells[column]!.trim() : '';
        };
        const title = get('title');
        if (!title || title.length > (request.mapping.kind === 'task' ? 300 : 200))
          fail('제목이 비어 있거나 길이 제한을 초과했습니다.');
        const description = get('description') || null;
        if (description && description.length > 10_000) fail('설명은 10,000자 이하여야 합니다.');
        const sourceId = notionPageId(get('sourceId'));
        const sourceTags = tokens(get('tags'));
        const statuses: Record<string, MappedNotionRow['status']> = {
          todo: 'todo',
          'to do': 'todo',
          'not started': 'todo',
          대기: 'todo',
          '할 일': 'todo',
          미완료: 'todo',
          in_progress: 'in_progress',
          'in progress': 'in_progress',
          '진행 중': 'in_progress',
          진행중: 'in_progress',
          done: 'done',
          complete: 'done',
          completed: 'done',
          완료: 'done',
          cancelled: 'cancelled',
          canceled: 'cancelled',
          취소: 'cancelled',
          포기: 'cancelled',
          못함: 'cancelled',
        };
        const state = get('status').toLowerCase();
        if (state && !Object.hasOwn(statuses, state))
          fail('지원하지 않는 상태입니다. todo/in_progress/done/cancelled로 정리하세요.');
        let status = statuses[state] ?? 'todo';
        const check = get('completed').toLowerCase();
        if (
          check &&
          !['true', 'false', 'yes', 'no', '1', '0', '완료', '미완료', '☑', '☐'].includes(check)
        )
          fail('완료 체크는 true/false로 입력하세요.');
        if (['true', 'yes', '1', '완료', '☑'].includes(check)) {
          if (status === 'cancelled') fail('완료 체크와 취소 상태가 충돌합니다.');
          status = 'done';
        }
        if (sourceTags.some((s) => ['포기', '못함'].includes(s))) {
          if (status === 'done') fail('완료 상태와 포기·못함 태그가 충돌합니다.');
          status = 'cancelled';
        }
        const priorities: Record<string, MappedNotionRow['priority']> = {
          none: 'none',
          없음: 'none',
          high: 'high',
          높음: 'high',
          p1: 'high',
          medium: 'medium',
          보통: 'medium',
          p2: 'medium',
          low: 'low',
          낮음: 'low',
          p3: 'low',
        };
        const p = get('priority').toLowerCase();
        if (p && !Object.hasOwn(priorities, p))
          fail('우선순위는 none/high/medium/low 또는 P1/P2/P3로 입력하세요.');
        const tagPriority = sourceTags
          .map((s) => s.toLowerCase())
          .find((s) => ['p1', 'p2', 'p3'].includes(s));
        if (
          new Set(sourceTags.filter((s) => /^p[123]$/i.test(s)).map((s) => s.toLowerCase())).size >
          1
        )
          fail('우선순위 태그 P1/P2/P3 중 하나만 지정하세요.');
        if (p && tagPriority && priorities[p] !== priorities[tagPriority])
          fail('우선순위와 P1/P2/P3 태그가 충돌합니다.');
        const priority = priorities[p] ?? (tagPriority ? priorities[tagPriority]! : 'none');
        const tags = parse(
          tagNamesSchema,
          sourceTags.filter(
            (s) => !['오늘', '포기', '못함', 'p1', 'p2', 'p3'].includes(s.toLowerCase()),
          ),
        );
        const refs: MappedNotionRow['refs'] = {};
        for (const key of ['parent', 'project', 'activity', 'place'] as const) {
          const values = tokens(get(key));
          if (values.length > 1)
            fail(`${NOTION_FIELDS[key]}: 관계는 한 항목만 연결할 수 있습니다.`);
          if (values[0]) refs[key] = notionPageId(values[0]);
        }
        const scheduledStart = date(get('scheduledStart'), timeZone);
        const scheduledEnd = date(get('scheduledEnd'), timeZone, true);
        if (scheduledEnd && (!scheduledStart || scheduledEnd < scheduledStart))
          fail('예정 종료일은 시작일 이후여야 합니다.');
        const completedAt = date(get('completedAt'), timeZone);
        if (completedAt && status !== 'done') fail('완료일이 있으면 완료 상태도 지정하세요.');
        const warnings: string[] = [];
        if (status === 'done' && !completedAt)
          warnings.push('완료일 미상으로 저장합니다. 오늘 완료한 것으로 바꾸지 않습니다.');
        const mapped = {
          index,
          sourceId,
          title,
          description,
          status,
          priority,
          tags,
          refs,
          scheduledStart,
          scheduledEnd,
          dueAt: date(get('dueAt'), timeZone, true),
          completedAt,
          createdAt: date(get('createdAt'), timeZone),
          sourceUpdatedAt: date(get('sourceUpdatedAt'), timeZone),
          allDay: !get('scheduledStart') || /^\d{4}-\d{2}-\d{2}$/.test(get('scheduledStart')),
          warnings,
          raw,
          sourceHash: importHash({ raw, mapping: request.mapping, timeZone }),
        };
        return { index, row: mapped };
      } catch (e) {
        if (e instanceof ValidationError)
          return {
            index,
            error: e.message,
            title: Object.hasOwn(cells, request.mapping.columns.title ?? '')
              ? cells[request.mapping.columns.title!]!.slice(0, 300)
              : '',
          };
        throw e;
      }
    },
  );
}
