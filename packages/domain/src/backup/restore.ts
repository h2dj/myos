import { schema, type Db } from '@myos/db';
import { count, sql } from 'drizzle-orm';
import { ValidationError } from '../errors';
import { exportWorkspaceBackup } from './export';
import { backupTableSummary, parseWorkspaceBackup } from './format';

/** 이 함수는 HTTP에 연결하지 않는다. 임시 검증 DB에서만 실행하며 덮어쓰기는 없다. */
export async function restoreBackupForVerification(db: Db, text: string) {
  const backup = parseWorkspaceBackup(text);
  await db.transaction(async (tx) => {
    const [current] = await tx.execute<{ name: string }>(sql`select current_database() as name`);
    if (!current?.name.startsWith('myos_restore_'))
      throw new ValidationError('myos_restore_ 임시 검증 DB에서만 복원할 수 있습니다.');
    const [users] = await tx.select({ count: count() }).from(schema.users);
    const [workspaces] = await tx.select({ count: count() }).from(schema.workspaces);
    const [audit] = await tx.select({ count: count() }).from(schema.auditLogs);
    if (users!.count || workspaces!.count || audit!.count)
      throw new ValidationError('빈 검증 DB에만 복원할 수 있습니다.');
    const { tables: t } = backup;
    const userIds = new Set([backup.workspace.ownerId]);
    for (const rows of [t.places, t.activities, t.projects, t.series, t.tasks, t.notes, t.inbox]) {
      for (const row of rows) if (row.createdBy) userIds.add(row.createdBy);
    }
    for (const task of t.tasks) if (task.assigneeId) userIds.add(task.assigneeId);
    // 실제 계정/인증 정보를 복원하지 않는다. FK를 위한 검증 전용 가상 프로필이다.
    const batch = async <T>(rows: T[], insert: (rows: T[]) => PromiseLike<unknown>) => {
      for (let n = 0; n < rows.length; n += 500) await insert(rows.slice(n, n + 500));
    };
    await batch([...userIds], (ids) =>
      tx.insert(schema.users).values(
        ids.map((id) => ({
          id,
          email: `${id}@restore.invalid`,
          name: '복원 검증 사용자',
          notifyEmail: false,
        })),
      ),
    );
    const revive = <T extends object>(row: T) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          typeof value === 'string' &&
          (key.endsWith('At') || key === 'scheduledStart' || key === 'scheduledEnd')
            ? new Date(value)
            : value,
        ]),
      );
    await tx
      .insert(schema.workspaces)
      .values(revive(backup.workspace) as typeof schema.workspaces.$inferInsert);
    await tx.insert(schema.workspaceMembers).values({
      workspaceId: backup.workspace.id,
      userId: backup.workspace.ownerId,
      role: 'owner',
    });
    // 버전별 고정 테이블만 허용한다. 파일에서 SQL/테이블 이름/접속 주소를 받지 않는다.
    await batch(t.financeAccounts ?? [], (rows) =>
      tx
        .insert(schema.financeAccounts)
        .values(rows.map((row) => revive(row) as typeof schema.financeAccounts.$inferInsert)),
    );
    await batch(t.financeEntries ?? [], (rows) =>
      tx
        .insert(schema.financeEntries)
        .values(rows.map((row) => revive(row) as typeof schema.financeEntries.$inferInsert)),
    );
    await batch(t.financeBudgets ?? [], (rows) =>
      tx
        .insert(schema.financeBudgets)
        .values(rows.map((row) => revive(row) as typeof schema.financeBudgets.$inferInsert)),
    );
    await batch(t.places, (rows) =>
      tx
        .insert(schema.activityPlaces)
        .values(rows.map((row) => revive(row) as typeof schema.activityPlaces.$inferInsert)),
    );
    await batch(t.activities, (rows) =>
      tx
        .insert(schema.activities)
        .values(rows.map((row) => revive(row) as typeof schema.activities.$inferInsert)),
    );
    await batch(t.projects, (rows) =>
      tx
        .insert(schema.projects)
        .values(
          rows.map(
            (row) => ({ ...revive(row), parentId: null }) as typeof schema.projects.$inferInsert,
          ),
        ),
    );
    await batch(
      t.projects.filter((row) => row.parentId !== null),
      (rows) =>
        tx.execute(sql`
      update projects as p set parent_id = v.parent_id from (values ${sql.join(
        rows.map((row) => sql`(${row.id}::uuid, ${row.parentId}::uuid)`),
        sql`, `,
      )}) as v(id, parent_id) where p.id = v.id
    `),
    );
    await batch(t.series, (rows) =>
      tx
        .insert(schema.taskSeries)
        .values(rows.map((row) => revive(row) as typeof schema.taskSeries.$inferInsert)),
    );
    await batch(t.tasks, (rows) =>
      tx
        .insert(schema.tasks)
        .values(rows.map((row) => revive(row) as typeof schema.tasks.$inferInsert)),
    );
    await batch(t.notes, (rows) =>
      tx
        .insert(schema.notes)
        .values(rows.map((row) => revive(row) as typeof schema.notes.$inferInsert)),
    );
    await batch(t.inbox, (rows) =>
      tx
        .insert(schema.inboxItems)
        .values(rows.map((row) => revive(row) as typeof schema.inboxItems.$inferInsert)),
    );
    await batch(t.tags, (rows) =>
      tx
        .insert(schema.tags)
        .values(rows.map((row) => revive(row) as typeof schema.tags.$inferInsert)),
    );
    await batch(t.entityTags, (rows) =>
      tx
        .insert(schema.entityTags)
        .values(rows.map((row) => revive(row) as typeof schema.entityTags.$inferInsert)),
    );
    await batch(t.lifeReviews ?? [], (rows) =>
      tx
        .insert(schema.lifeReviews)
        .values(rows.map((row) => revive(row) as typeof schema.lifeReviews.$inferInsert)),
    );
    await batch(t.externalRefs ?? [], (rows) =>
      tx
        .insert(schema.externalRefs)
        .values(rows.map((row) => revive(row) as typeof schema.externalRefs.$inferInsert)),
    );
    await batch(t.links, (rows) =>
      tx
        .insert(schema.entityLinks)
        .values(rows.map((row) => revive(row) as typeof schema.entityLinks.$inferInsert)),
    );
  });
  const restored = await exportWorkspaceBackup(
    db,
    { userId: backup.workspace.ownerId },
    backup.workspace.id,
  );
  const before = backupTableSummary(backup.tables),
    after = backupTableSummary(restored.tables);
  if (
    JSON.stringify(backup.workspace) !== JSON.stringify(restored.workspace) ||
    JSON.stringify(before) !== JSON.stringify(after)
  )
    throw new ValidationError('복원 후 개수 또는 내용·연결 체크섬이 일치하지 않습니다.');
  return { verified: true, workspaceVerified: true, tables: after };
}
