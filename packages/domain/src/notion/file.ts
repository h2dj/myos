import { ValidationError } from '../errors';

export const MAX_NOTION_BYTES = 256 * 1024;
export const MAX_NOTION_ROWS = 200;
export type NotionFile = {
  columns: string[];
  rows: { raw: Record<string, unknown>; cells: Record<string, string> }[];
};
const fail = (message: string): never => {
  throw new ValidationError(message);
};
const cell = (v: unknown): string =>
  typeof v === 'string'
    ? v
    : v == null
      ? ''
      : typeof v === 'object'
        ? JSON.stringify(v)
        : String(v);

/** RFC 4180 subset: commas, escaped quotes, quoted newlines, CRLF and UTF-8 BOM. */
function csv(text: string): Record<string, unknown>[] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
        closed = true;
      } else field += ch;
    } else if (ch === ',' || ch === '\n' || ch === '\r') {
      row.push(field);
      field = '';
      closed = false;
      if (ch !== ',') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        if (row.some((v) => v.length)) rows.push(row);
        row = [];
      }
    } else if (ch === '"' && !field && !closed) quoted = true;
    else {
      if (closed || ch === '"') fail('CSV 따옴표 형식을 확인하세요.');
      field += ch;
    }
    if (rows.length > MAX_NOTION_ROWS + 1) fail('파일은 200행 이하여야 합니다.');
  }
  if (quoted) fail('CSV 따옴표가 닫히지 않았습니다.');
  row.push(field);
  if (row.some((v) => v.length)) rows.push(row);
  const headers = rows.shift()?.map((s) => s.trim()) ?? [];
  if (!headers?.length || headers.some((s) => !s) || new Set(headers).size !== headers.length)
    fail('CSV 첫 행에는 비어 있지 않은 서로 다른 속성명이 필요합니다.');
  return rows.map((values) => {
    if (values.length !== headers.length) fail('CSV 행의 열 개수가 첫 행과 다릅니다.');
    return Object.fromEntries(headers.map((key, i) => [key, values[i]!]));
  });
}
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    return fail('JSON은 객체 목록이어야 합니다.');
  return v as Record<string, unknown>;
}
function flatten(raw: Record<string, unknown>) {
  if (raw.object !== 'page' || !raw.properties)
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, cell(v)]));
  const cells: Record<string, string> = Object.assign(Object.create(null), {
    '$notion.id': cell(raw.id),
    '$notion.created_time': cell(raw.created_time),
    '$notion.last_edited_time': cell(raw.last_edited_time),
  });
  const properties = object(raw.properties);
  if (Object.keys(properties).some((name) => name.startsWith('$notion.')))
    fail('$notion.으로 시작하는 예약 속성명은 사용할 수 없습니다.');
  for (const [name, value] of Object.entries(properties)) {
    const p = object(value),
      type = p.type as string;
    if (type === 'title' || type === 'rich_text')
      cells[name] = (Array.isArray(p[type]) ? p[type] : [])
        .map((r: unknown) => {
          const text = object(r);
          return cell(text.plain_text ?? (text.text && object(text.text).content));
        })
        .join('');
    else if (type === 'date') {
      const date = p.date ? object(p.date) : {};
      cells[name] = cell(date.start);
      cells[`${name}.end`] = cell(date.end);
    } else if (type === 'select' || type === 'status')
      cells[name] = p[type] ? cell(object(p[type]).name) : '';
    else if (type === 'multi_select' || type === 'relation') {
      if (p.has_more === true)
        fail('일부 관계만 있는 JSON입니다. Notion의 전체 관계 목록을 포함하세요.');
      cells[name] = JSON.stringify(
        (Array.isArray(p[type]) ? p[type] : []).map((v: unknown) =>
          cell(object(v)[type === 'relation' ? 'id' : 'name']),
        ),
      );
    } else if (
      [
        'checkbox',
        'url',
        'created_time',
        'last_edited_time',
        'number',
        'email',
        'phone_number',
      ].includes(type)
    )
      cells[name] = cell(p[type]);
  }
  return cells;
}
export function readNotionFile(text: string, format: 'csv' | 'json'): NotionFile {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_NOTION_BYTES)
    fail('파일은 UTF-8 256KiB 이하여야 합니다.');
  if (format !== 'csv' && format !== 'json') fail('CSV 또는 JSON 형식을 선택하세요.');
  text = text.replace(/^\uFEFF/, '');
  let raw: Record<string, unknown>[];
  if (format === 'csv') raw = csv(text);
  else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return fail('JSON 파일을 읽을 수 없습니다.');
    }
    let nodes = 0;
    const bounded = (v: unknown, depth: number) => {
      if (++nodes > 30_000 || depth > 20) fail('JSON 구조가 너무 크거나 깊습니다.');
      if (v && typeof v === 'object')
        for (const child of Object.values(v)) bounded(child, depth + 1);
    };
    bounded(parsed, 0);
    if (!Array.isArray(parsed)) {
      const list = object(parsed);
      if (list.has_more === true) fail('다음 페이지가 남은 JSON입니다. 모든 페이지를 포함하세요.');
      parsed = list.results;
    }
    if (!Array.isArray(parsed)) return fail('JSON 배열 또는 Notion results 목록이 필요합니다.');
    raw = parsed.map(object);
  }
  if (!raw.length || raw.length > MAX_NOTION_ROWS) fail('파일은 1~200행이어야 합니다.');
  const rows = raw.map((r) => ({ raw: r, cells: flatten(r) }));
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r.cells)))];
  if (columns.length > 100 || columns.some((s) => s.length > 200))
    fail('속성은 이름 200자 이내, 최대 100개까지 지원합니다.');
  return { columns, rows };
}

export function notionPageId(value: string): string {
  let id = value.trim();
  if (/^https:\/\//i.test(id)) {
    let url: URL;
    try {
      url = new URL(id);
    } catch {
      return fail('Notion 페이지 ID 또는 URL을 확인하세요.');
    }
    if (!(
      url.hostname === 'notion.so' ||
      url.hostname.endsWith('.notion.so') ||
      url.hostname.endsWith('.notion.site')
    ))
      fail('Notion 페이지 URL만 사용할 수 있습니다.');
    id =
      url.pathname.match(/([a-f\d]{32}|[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})\/?$/i)?.[1] ?? '';
  }
  id = id.replaceAll('-', '').toLowerCase();
  if (!/^[a-f\d]{32}$/.test(id))
    fail('안정적인 Notion 페이지 ID(32자리 또는 UUID)나 페이지 URL이 필요합니다.');
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}
