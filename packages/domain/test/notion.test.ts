import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { schema } from '@myos/db';
import {
  deleteTask,
  exportWorkspaceBackup,
  importNotionSample,
  mapNotionFile,
  notionPageId,
  parseWorkspaceBackup,
  previewNotionImport,
  readNotionFile,
  sealWorkspaceBackup,
  updateTask,
  type NotionMapping,
  type NotionRequest,
} from '../src';
import { addMember, db, newUser } from './helpers';
const zone = 'Asia/Seoul';
function request(
  kind: NotionMapping['kind'],
  rows: Record<string, unknown>[],
  columns: NotionMapping['columns'] = {},
): NotionRequest {
  return {
    format: 'json',
    text: JSON.stringify(rows),
    mapping: { kind, columns: { sourceId: 'id', title: 'title', ...columns } },
  };
}
async function save(
  user: Awaited<ReturnType<typeof newUser>>,
  input: NotionRequest,
  selected?: number[],
) {
  const preview = await previewNotionImport(db, user.actor, user.workspaceId, input, zone);
  const result = await importNotionSample(db, user.actor, user.workspaceId, input, zone, {
    digest: preview.digest,
    selected: selected ?? preview.rows.map((r) => r.index),
  });
  return { preview, result };
}
async function refs(workspaceId: string) {
  return db
    .select()
    .from(schema.externalRefs)
    .where(eq(schema.externalRefs.workspaceId, workspaceId));
}

describe('Notion file mapping', () => {
  it('reads BOM, CRLF, multiline quotes and retains all source properties', () => {
    const file = readNotionFile(
      '\uFEFFid,title,메모\r\n123,"쉼표,제목","첫 줄\n둘째 ""인용"""\r\n',
      'csv',
    );
    expect(file.rows[0]!.cells).toEqual({
      id: '123',
      title: '쉼표,제목',
      메모: '첫 줄\n둘째 "인용"',
    });
    for (const bad of [
      'id,id\na,b',
      'id,title\na,b,c',
      'id,title\na,"닫히지 않음',
      'id,title\na,"닫힘"x',
    ])
      expect(() => readNotionFile(bad, 'csv')).toThrow();
    expect(() => readNotionFile('x'.repeat(256 * 1024 + 1), 'csv')).toThrow('256KiB');
    expect(() =>
      readNotionFile(JSON.stringify(Array.from({ length: 201 }, () => ({ id: 'a' }))), 'json'),
    ).toThrow('200행');
    expect(() => readNotionFile('{"results":[],"has_more":true}', 'json')).toThrow('다음 페이지');
  });
  it('maps actual Notion page properties and rejects truncated relations', () => {
    const id = randomUUID(),
      related = randomUUID();
    const page = {
      object: 'page',
      id,
      created_time: '2025-01-01T00:00:00.000Z',
      last_edited_time: '2025-02-01T00:00:00.000Z',
      properties: {
        이름: { type: 'title', title: [{ plain_text: '노션 제목' }] },
        예정일: { type: 'date', date: { start: '2026-10-20', end: '2026-10-21' } },
        상태: { type: 'status', status: { name: '완료' } },
        완료일: { type: 'date', date: { start: '2026-10-21', end: null } },
        태그: {
          type: 'multi_select',
          multi_select: [{ name: 'P1' }, { name: '업무,기록' }, { name: '오늘' }],
        },
        프로젝트: { type: 'relation', relation: [{ id: related }], has_more: false },
      },
    };
    const input: NotionRequest = {
      text: JSON.stringify({ results: [page], has_more: false }),
      format: 'json',
      mapping: {
        kind: 'task',
        columns: {
          sourceId: '$notion.id',
          title: '이름',
          scheduledStart: '예정일',
          scheduledEnd: '예정일.end',
          status: '상태',
          completedAt: '완료일',
          tags: '태그',
          project: '프로젝트',
          createdAt: '$notion.created_time',
          sourceUpdatedAt: '$notion.last_edited_time',
        },
      },
    };
    const row = mapNotionFile(input, zone)[0]!.row!;
    expect(row).toMatchObject({
      title: '노션 제목',
      status: 'done',
      priority: 'high',
      tags: ['업무,기록'],
      scheduledStart: '2026-10-19T15:00:00.000Z',
      scheduledEnd: '2026-10-21T14:59:59.999Z',
      completedAt: '2026-10-20T15:00:00.000Z',
      refs: { project: related },
      raw: page,
    });
    page.properties.프로젝트.has_more = true;
    expect(() => readNotionFile(JSON.stringify([page]), 'json')).toThrow('전체 관계');
    expect(notionPageId(`https://www.notion.so/제목-${id.replaceAll('-', '')}?pvs=4`)).toBe(id);
    expect(() => notionPageId('https://example.com/' + id)).toThrow('Notion');
  });
  it('reports ambiguous dates, statuses and relations without guessing', () => {
    for (const [key, value] of Object.entries({
      scheduledStart: '10/23/2026',
      status: '임의 상태',
      project: `${randomUUID()},${randomUUID()}`,
      priority: '긴급',
    })) {
      const input = request('task', [{ id: randomUUID(), title: '검증', [key]: value }], {
        [key]: key,
      });
      expect(mapNotionFile(input, zone)[0]!.error).toBeTruthy();
    }
    for (const key of ['status', 'priority']) {
      expect(
        mapNotionFile(
          request('task', [{ id: randomUUID(), title: '검증', [key]: 'constructor' }], {
            [key]: key,
          }),
          zone,
        )[0]!.error,
      ).toBeTruthy();
    }
    const missing = mapNotionFile(
      request('task', [{ id: randomUUID(), constructor: '제목' }, { id: randomUUID() }], {
        title: 'constructor',
      }),
      zone,
    );
    expect(missing[1]!.error).toContain('제목');
    const row = mapNotionFile(
      request('task', [{ id: randomUUID(), title: '날짜 미상', completed: 'true' }], {
        completed: 'completed',
      }),
      zone,
    )[0]!.row!;
    expect(row.completedAt).toBeNull();
    expect(row.warnings).toHaveLength(1);
    const reused = mapNotionFile(
      request(
        'task',
        [{ id: randomUUID(), title: '명시적 날짜 매핑', date: '2025-02-01', completed: true }],
        { completed: 'completed', completedAt: 'date', scheduledStart: 'date' },
      ),
      zone,
    )[0]!.row!;
    expect(reused.completedAt).toBe(reused.scheduledStart);
    const timed = mapNotionFile(
      request(
        'task',
        [{ id: randomUUID(), title: '시각', scheduledStart: '2026-10-20T09:30:00+09:00' }],
        { scheduledStart: 'scheduledStart' },
      ),
      zone,
    )[0]!.row!;
    expect(timed.scheduledStart).toBe('2026-10-20T00:30:00.000Z');
    expect(timed.allDay).toBe(false);
    const dst = mapNotionFile(
      request('task', [{ id: randomUUID(), title: 'DST', dueAt: '2026-03-08' }], {
        dueAt: 'dueAt',
      }),
      'America/New_York',
    )[0]!.row!;
    expect(dst.dueAt).toBe('2026-03-09T03:59:59.999Z');
  });
});

describe('Notion sample import', () => {
  it('previews without writes, imports hierarchy and links, preserves dates, raw and backup identity', async () => {
    const user = await newUser();
    const placeId = randomUUID(),
      activityId = randomUUID(),
      parentId = randomUUID(),
      childId = randomUUID(),
      taskId = randomUUID();
    await save(user, request('place', [{ id: placeId, title: '단체' }]));
    await save(
      user,
      request('activity', [{ id: activityId, title: '상시 활동', place: placeId }], {
        place: 'place',
      }),
    );
    const projects = request(
      'project',
      [
        { id: childId, title: '하위', parent: parentId },
        { id: parentId, title: '상위' },
      ],
      { parent: 'parent' },
    );
    expect((await save(user, projects)).result.created).toBe(2);
    const raw = {
      id: taskId,
      title: '과거 완료',
      completed: true,
      completedAt: '2025-02-01',
      scheduledStart: '2025-02-01',
      createdAt: '2025-01-01T00:00:00Z',
      sourceUpdatedAt: '2025-02-02T00:00:00Z',
      tags: 'P2,오늘,업무',
      project: childId,
      activity: activityId,
      place: placeId,
      ignored: '원본 보존',
    };
    const input = request('task', [raw], {
      completed: 'completed',
      completedAt: 'completedAt',
      scheduledStart: 'scheduledStart',
      createdAt: 'createdAt',
      sourceUpdatedAt: 'sourceUpdatedAt',
      tags: 'tags',
      project: 'project',
      activity: 'activity',
      place: 'place',
    });
    const preview = await previewNotionImport(db, user.actor, user.workspaceId, input, zone);
    expect(preview.rows[0]!.disposition).toBe('new');
    expect(preview.rows[0]!.referenceNames).toMatchObject({
      project: '하위',
      activity: '상시 활동',
      place: '단체',
    });
    expect(preview.ignoredColumns).toEqual(['ignored']);
    expect(await refs(user.workspaceId)).toHaveLength(4);
    expect((await save(user, input)).result.created).toBe(1);
    const ledger = await refs(user.workspaceId),
      taskRef = ledger.find((r) => r.externalId === taskId)!;
    const [task] = await db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.id, taskRef.entityId));
    expect(task).toMatchObject({
      status: 'done',
      priority: 'medium',
      completedAt: new Date('2025-01-31T15:00:00Z'),
      createdAt: new Date('2025-01-01T00:00:00Z'),
      projectId: ledger.find((r) => r.externalId === childId)!.entityId,
      activityId: ledger.find((r) => r.externalId === activityId)!.entityId,
      activityPlaceId: ledger.find((r) => r.externalId === placeId)!.entityId,
    });
    expect(taskRef.raw).toEqual(raw);
    const backup = await exportWorkspaceBackup(db, user.actor, user.workspaceId);
    expect(backup.version).toBe(5);
    expect(backup.tables.externalRefs).toHaveLength(5);
    expect(parseWorkspaceBackup(JSON.stringify(backup))).toEqual(backup);
    const { sha256: _hash, ...legacy } = backup;
    void _hash;
    delete legacy.tables.financeComments;
    delete legacy.tables.financeAccounts;
    delete legacy.tables.financeEntries;
    delete legacy.tables.financeBudgets;
    delete legacy.tables.externalRefs;
    delete legacy.tables.lifeReviews;
    expect(
      parseWorkspaceBackup(JSON.stringify(sealWorkspaceBackup({ ...legacy, version: 1 }))),
    ).toMatchObject({ version: 1 });
  });
  it('serializes simultaneous attempts and skips changed or deleted sources without overwriting', async () => {
    const user = await newUser(),
      id = randomUUID();
    const input = request('task', [{ id, title: '원본' }]);
    const preview = await previewNotionImport(db, user.actor, user.workspaceId, input, zone);
    const results = await Promise.all(
      [0, 1].map(() =>
        importNotionSample(db, user.actor, user.workspaceId, input, zone, {
          digest: preview.digest,
          selected: [0],
        }),
      ),
    );
    expect(results.reduce((n, r) => n + r.created, 0)).toBe(1);
    expect(results.reduce((n, r) => n + r.skipped, 0)).toBe(1);
    const ref = (await refs(user.workspaceId))[0]!;
    await updateTask(db, user.actor, ref.entityId, { title: 'MyOS에서 편집' });
    const changed = request('task', [{ id, title: '원본 변경' }]);
    expect((await save(user, changed)).result.skipped).toBe(1);
    const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, ref.entityId));
    expect(task!.title).toBe('MyOS에서 편집');
    await deleteTask(db, user.actor, ref.entityId);
    expect((await save(user, input)).result.skipped).toBe(1);
    await db.delete(schema.tasks).where(eq(schema.tasks.id, ref.entityId));
    expect((await save(user, input)).result.skipped).toBe(1);
    expect(await refs(user.workspaceId)).toHaveLength(1);
    expect(
      (
        await previewNotionImport(
          db,
          user.actor,
          user.workspaceId,
          request('project', [{ id, title: '종류 변경' }]),
          zone,
        )
      ).rows[0]!.disposition,
    ).toBe('error');
  });
  it('reports missing dependencies per row, retries safely and rejects cycles and repeated source IDs', async () => {
    const user = await newUser(),
      parent = randomUUID(),
      child = randomUUID();
    const input = request(
      'project',
      [
        { id: child, title: '하위', parent },
        { id: parent, title: '상위' },
      ],
      { parent: 'parent' },
    );
    expect((await save(user, input, [0])).result.failed).toBe(1);
    expect(await refs(user.workspaceId)).toHaveLength(0);
    expect((await save(user, input)).result.created).toBe(2);
    expect((await save(user, input)).result.skipped).toBe(2);
    const cycleA = randomUUID(),
      cycleB = randomUUID();
    const cycle = request(
      'project',
      [
        { id: cycleA, title: 'A', parent: cycleB },
        { id: cycleB, title: 'B', parent: cycleA },
      ],
      { parent: 'parent' },
    );
    expect(
      (await previewNotionImport(db, user.actor, user.workspaceId, cycle, zone)).rows.every(
        (r) => r.disposition === 'error',
      ),
    ).toBe(true);
    const duplicate = request('task', [
      { id: child, title: '1' },
      { id: child, title: '2' },
    ]);
    expect(
      (await previewNotionImport(db, user.actor, user.workspaceId, duplicate, zone)).rows.every(
        (r) => r.disposition === 'error',
      ),
    ).toBe(true);
    const partial = request('task', [
      { id: randomUUID(), title: '' },
      { id: randomUUID(), title: '정상' },
    ]);
    expect((await save(user, partial)).result).toMatchObject({ created: 1, failed: 1 });
  });
  it('rejects stale mappings, more than 10 rows, foreign references and unauthorized roles', async () => {
    const user = await newUser(),
      other = await newUser();
    const project = request('project', [{ id: randomUUID(), title: '비공개' }]);
    await save(other, project);
    const foreignId = JSON.parse(project.text)[0].id as string;
    const input = request('task', [{ id: randomUUID(), title: '참조', project: foreignId }], {
      project: 'project',
    });
    expect(
      (await previewNotionImport(db, user.actor, user.workspaceId, input, zone)).rows[0]!
        .disposition,
    ).toBe('error');
    const valid = request(
      'task',
      Array.from({ length: 11 }, (_, i) => ({ id: randomUUID(), title: String(i) })),
    );
    const preview = await previewNotionImport(db, user.actor, user.workspaceId, valid, zone);
    await expect(
      importNotionSample(db, user.actor, user.workspaceId, valid, zone, {
        digest: preview.digest,
        selected: Array.from({ length: 11 }, (_, i) => i),
      }),
    ).rejects.toThrow();
    await expect(
      importNotionSample(
        db,
        user.actor,
        user.workspaceId,
        { ...valid, text: valid.text + ' ' },
        zone,
        { digest: preview.digest, selected: [0] },
      ),
    ).rejects.toThrow('미리보기');
    await expect(
      previewNotionImport(db, other.actor, user.workspaceId, valid, zone),
    ).rejects.toThrow();
    for (const role of ['viewer', 'editor'] as const) {
      const member = await newUser();
      await addMember(user.workspaceId, member.actor.userId, role);
      await expect(
        previewNotionImport(db, member.actor, user.workspaceId, valid, zone),
      ).rejects.toThrow();
      await expect(
        importNotionSample(db, member.actor, user.workspaceId, valid, zone, {
          digest: preview.digest,
          selected: [0],
        }),
      ).rejects.toThrow();
    }
    expect(await refs(user.workspaceId)).toHaveLength(0);
    const [table] = await db.execute<{ enabled: boolean }>(
      sql`select relrowsecurity as enabled from pg_class where oid = 'public.external_refs'::regclass`,
    );
    expect(table!.enabled).toBe(true);
    expect(
      await db
        .select()
        .from(schema.tasks)
        .where(and(eq(schema.tasks.workspaceId, user.workspaceId), eq(schema.tasks.title, '0'))),
    ).toHaveLength(0);
  });
});
