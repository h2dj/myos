import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { schema } from '@myos/db';
import { eq, sql } from 'drizzle-orm';
import {
  archiveFinanceAccount,
  backupTableSummary,
  deleteFinanceBudget,
  deleteFinanceComment,
  exportWorkspaceBackup,
  getFinanceComments,
  parseWorkspaceBackup,
  saveFinanceAccount,
  saveFinanceBudget,
  saveFinanceComment,
  sealWorkspaceBackup,
} from '../src';
import { db, newUser, addMember, newSharedWorkspace } from './helpers';
const account = {
  name: '설명 계좌',
  kind: 'bank',
  openingBalance: '10000',
  description: '생활비 전용',
};

describe('계좌·예산 설명과 추가 메모', () => {
  it('설명을 저장·수정하고 설명 없는 기존 호출은 내용을 보존한다', async () => {
    const { actor } = await newUser();
    const a = await saveFinanceAccount(db, actor, account);
    await saveFinanceAccount(
      db,
      actor,
      { name: '이름 수정', kind: 'bank', openingBalance: '10000' },
      a.id,
    );
    expect((await getFinanceComments(db, actor, { kind: 'account', id: a.id })).description).toBe(
      '생활비 전용',
    );
    const b = await saveFinanceBudget(db, actor, {
      month: '2026-01',
      category: '식비',
      amount: '30000',
      description: '외식 포함',
    });
    await saveFinanceBudget(db, actor, { month: '2026-01', category: '식비', amount: '40000' });
    expect((await getFinanceComments(db, actor, { kind: 'budget', id: b.id })).description).toBe(
      '외식 포함',
    );
  });
  it('여러 메모·중복 재시도·수정·삭제와 보관 계좌를 지원한다', async () => {
    const { actor } = await newUser();
    const a = await saveFinanceAccount(db, actor, account);
    const target = { kind: 'account', id: a.id };
    const id = randomUUID();
    await Promise.all([
      saveFinanceComment(db, actor, target, { body: '첫 메모' }, id),
      saveFinanceComment(db, actor, target, { body: '첫 메모' }, id),
    ]);
    await archiveFinanceAccount(db, actor, a.id, true);
    await saveFinanceComment(db, actor, target, { body: '둘째 메모' }, randomUUID());
    expect((await getFinanceComments(db, actor, target)).total).toBe(2);
    await saveFinanceComment(db, actor, target, { body: '수정한 메모' }, id, true);
    expect(
      (await getFinanceComments(db, actor, target)).comments.some((c) => c.body === '수정한 메모'),
    ).toBe(true);
    await deleteFinanceComment(db, actor, target, id);
    expect((await getFinanceComments(db, actor, target)).total).toBe(1);
    await expect(
      saveFinanceComment(db, actor, target, { body: ' ' }, randomUUID()),
    ).rejects.toThrow();
    await expect(
      saveFinanceComment(db, actor, target, { body: 'x'.repeat(3001) }, randomUUID()),
    ).rejects.toThrow();
  });
  it('타인·다른 대상의 메모 수정·삭제를 막고 공유 백업에 포함하지 않는다', async () => {
    const user = await newUser(),
      other = await newUser();
    const a = await saveFinanceAccount(db, user.actor, account),
      b = await saveFinanceAccount(db, user.actor, { ...account, name: '다른 계좌' });
    const target = { kind: 'account', id: a.id };
    const comment = await saveFinanceComment(
      db,
      user.actor,
      target,
      { body: '개인 메모 비밀' },
      randomUUID(),
    );
    await addMember(user.workspaceId, other.actor.userId, 'editor');
    await expect(getFinanceComments(db, other.actor, target)).rejects.toThrow();
    await expect(
      saveFinanceComment(db, other.actor, target, { body: '수정' }, comment.id, true),
    ).rejects.toThrow();
    await expect(
      deleteFinanceComment(db, user.actor, { kind: 'account', id: b.id }, comment.id),
    ).rejects.toThrow();
    const shared = await newSharedWorkspace(user.actor.userId);
    expect((await exportWorkspaceBackup(db, user.actor, shared)).tables.financeComments).toEqual(
      [],
    );
  });
  it('메모는 50개씩 페이지로 읽고 예산 삭제 시 해당 메모만 정리한다', async () => {
    const { actor, workspaceId } = await newUser();
    const b = await saveFinanceBudget(db, actor, {
      month: '2026-01',
      category: '식비',
      amount: '10',
      description: '',
    });
    await db.insert(schema.financeComments).values(
      Array.from({ length: 51 }, (_, i) => ({
        workspaceId,
        userId: actor.userId,
        budgetId: b.id,
        body: `메모 ${i}`,
      })),
    );
    const page = await getFinanceComments(db, actor, { kind: 'budget', id: b.id }, 2);
    expect(page).toMatchObject({ total: 51, page: 2, pages: 2 });
    expect(page.comments).toHaveLength(1);
    await deleteFinanceBudget(db, actor, b.id);
    expect(
      await db
        .select()
        .from(schema.financeComments)
        .where(eq(schema.financeComments.budgetId, b.id)),
    ).toHaveLength(0);
  });
  it('백업 v5는 설명·메모를 보존하고 v4의 누락된 설명은 빈 설명과 같은 내용으로 검증한다', async () => {
    const user = await newUser();
    const a = await saveFinanceAccount(db, user.actor, { ...account, description: '' });
    const target = { kind: 'account', id: a.id };
    await saveFinanceComment(db, user.actor, target, { body: '백업 메모' }, randomUUID());
    const backup = await exportWorkspaceBackup(db, user.actor, user.workspaceId);
    expect(backup.version).toBe(6);
    expect(parseWorkspaceBackup(JSON.stringify(backup))).toEqual(backup);
    expect(backup.tables.financeComments).toHaveLength(1);
    const { sha256: _sha, ...payload } = backup;
    void _sha;
    const old = structuredClone(payload);
    delete old.tables.financePlans;
    delete old.tables.financePlanOutcomes;
    delete old.tables.financeComments;
    for (const a of old.tables.financeAccounts ?? []) delete a.description;
    for (const b of old.tables.financeBudgets ?? []) delete b.description;
    const legacy = sealWorkspaceBackup({ ...old, version: 4 });
    expect(backupTableSummary(legacy.tables).financeAccounts).toEqual(
      backupTableSummary(backup.tables).financeAccounts,
    );
    const invalid = structuredClone(payload);
    invalid.tables.financeComments![0]!.accountId = randomUUID();
    expect(() => sealWorkspaceBackup(invalid)).toThrow('연결');
    const foreign = structuredClone(payload);
    foreign.tables.financeComments![0]!.userId = randomUUID();
    expect(() => sealWorkspaceBackup(foreign)).toThrow('소유자');
    const rls = await db.execute<{ enabled: boolean }>(
      sql`select relrowsecurity as enabled from pg_class where relnamespace = 'public'::regnamespace and relname = 'finance_comments'`,
    );
    expect(rls[0]!.enabled).toBe(true);
  });
});
