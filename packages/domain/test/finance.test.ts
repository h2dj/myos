import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { schema } from '@myos/db';
import { sql } from 'drizzle-orm';
import {
  archiveFinanceAccount,
  deleteFinanceBudget,
  exportWorkspaceBackup,
  getFinanceOverview,
  parseWorkspaceBackup,
  saveFinanceAccount,
  saveFinanceBudget,
  saveFinanceEntry,
  sealWorkspaceBackup,
  setFinanceEntryDeleted,
} from '../src';
import { db, newUser, addMember, newSharedWorkspace } from './helpers';

const date = '2026-01-15';
const accountInput = (
  name = '생활비',
  openingBalance = '0',
  kind: 'bank' | 'cash' | 'credit' = 'bank',
) => ({ name, openingBalance, kind });
const entryInput = (
  accountId: string,
  kind: 'income' | 'expense' | 'transfer' = 'expense',
  amount = '1000',
  targetAccountId: string | null = null,
) => ({
  accountId,
  kind,
  amount,
  targetAccountId,
  occurredOn: date,
  category: '식비',
  note: '검증 거래',
});

describe('개인 재정 관리', () => {
  it('수입·지출·카드 부채와 이체를 합산하되 이체는 월 순수입에서 제외한다', async () => {
    const { actor } = await newUser();
    const bank = await saveFinanceAccount(db, actor, accountInput('은행', '100000'));
    const cash = await saveFinanceAccount(db, actor, accountInput('현금', '0', 'cash'));
    const credit = await saveFinanceAccount(db, actor, accountInput('카드', '-20000', 'credit'));
    await saveFinanceEntry(db, actor, entryInput(bank.id, 'income', '50000'), randomUUID());
    await saveFinanceEntry(db, actor, entryInput(bank.id, 'expense', '10000'), randomUUID());
    await saveFinanceEntry(
      db,
      actor,
      entryInput(bank.id, 'transfer', '30000', cash.id),
      randomUUID(),
    );
    await saveFinanceEntry(db, actor, entryInput(credit.id, 'expense', '5000'), randomUUID());
    await saveFinanceEntry(
      db,
      actor,
      entryInput(bank.id, 'transfer', '20000', credit.id),
      randomUUID(),
    );
    const report = await getFinanceOverview(db, actor, '2026-01');
    expect(report).toMatchObject({
      income: '50000',
      expense: '15000',
      net: '35000',
      balance: '115000',
      total: 5,
    });
    expect(report.accounts.find((a) => a.id === bank.id)?.balance).toBe('90000');
    expect(report.accounts.find((a) => a.id === cash.id)?.balance).toBe('30000');
    expect(report.accounts.find((a) => a.id === credit.id)?.balance).toBe('-5000');
    expect(report.byCategory).toEqual([{ category: '식비', amount: '15000' }]);
  });
  it('거래의 동시 재시도·수정·삭제·복원에서 잔액을 한 번만 반영한다', async () => {
    const { actor } = await newUser();
    const a = await saveFinanceAccount(db, actor, accountInput('출발', '10000'));
    const b = await saveFinanceAccount(db, actor, accountInput('도착'));
    const id = randomUUID();
    await Promise.all([
      saveFinanceEntry(db, actor, entryInput(a.id, 'transfer', '3000', b.id), id),
      saveFinanceEntry(db, actor, entryInput(a.id, 'transfer', '3000', b.id), id),
    ]);
    let report = await getFinanceOverview(db, actor, '2026-01');
    expect(report.total).toBe(1);
    expect(report.accounts.find((x) => x.id === a.id)?.balance).toBe('7000');
    await saveFinanceEntry(db, actor, entryInput(a.id, 'expense', '2000'), id, true);
    report = await getFinanceOverview(db, actor, '2026-01');
    expect(report.accounts.find((x) => x.id === b.id)?.balance).toBe('0');
    expect(report.balance).toBe('8000');
    await setFinanceEntryDeleted(db, actor, id, true);
    report = await getFinanceOverview(db, actor, '2026-01');
    expect(report).toMatchObject({ balance: '10000', expense: '0', total: 0 });
    expect((await getFinanceOverview(db, actor, '2026-01', 1, true)).total).toBe(1);
    await setFinanceEntryDeleted(db, actor, id, false);
    await setFinanceEntryDeleted(db, actor, id, false);
    expect((await getFinanceOverview(db, actor, '2026-01')).balance).toBe('8000');
  });
  it('계좌 보관은 잔액을 유지하고 새 거래를 막으며 재개·기초 잔액 수정을 지원한다', async () => {
    const { actor } = await newUser();
    const account = await saveFinanceAccount(db, actor, accountInput('은행', '5000'));
    const entry = await saveFinanceEntry(db, actor, entryInput(account.id), randomUUID());
    await archiveFinanceAccount(db, actor, account.id, true);
    await expect(saveFinanceEntry(db, actor, entryInput(account.id), randomUUID())).rejects.toThrow(
      '사용 중인 계좌',
    );
    await saveFinanceEntry(db, actor, entryInput(account.id, 'expense', '2000'), entry.id, true);
    expect((await getFinanceOverview(db, actor, '2026-01')).balance).toBe('3000');
    await saveFinanceAccount(db, actor, accountInput('새 이름', '6000'), account.id);
    expect((await getFinanceOverview(db, actor, '2026-01')).balance).toBe('4000');
    await archiveFinanceAccount(db, actor, account.id, false);
    await saveFinanceEntry(db, actor, entryInput(account.id), randomUUID());
    expect((await getFinanceOverview(db, actor, '2026-01')).balance).toBe('3000');
  });
  it('날짜 경계와 페이지 수와 관계없이 월 전체 금액을 집계한다', async () => {
    const { actor, workspaceId } = await newUser();
    const account = await saveFinanceAccount(db, actor, accountInput());
    await saveFinanceEntry(
      db,
      actor,
      { ...entryInput(account.id), occurredOn: '2025-12-31' },
      randomUUID(),
    );
    await db.insert(schema.financeEntries).values(
      Array.from({ length: 51 }, () => ({
        workspaceId,
        userId: actor.userId,
        accountId: account.id,
        kind: 'expense' as const,
        amount: '1',
        category: '식비',
        occurredOn: '2026-01-01',
      })),
    );
    const report = await getFinanceOverview(db, actor, '2026-01', 2);
    expect(report).toMatchObject({ expense: '51', total: 51, pages: 2, page: 2 });
    expect(report.entries).toHaveLength(1);
    expect((await getFinanceOverview(db, actor, '2025-12')).expense).toBe('1000');
    expect((await getFinanceOverview(db, actor, '2026-02')).expense).toBe('0');
    expect((await getFinanceOverview(db, actor, '2026-01', 99)).page).toBe(2);
  });
  it('예산은 월·카테고리별로 한 번 저장하고 0원 한도·미예산 지출도 정확하게 표시한다', async () => {
    const { actor } = await newUser();
    const account = await saveFinanceAccount(db, actor, accountInput());
    await saveFinanceEntry(db, actor, entryInput(account.id), randomUUID());
    await saveFinanceEntry(
      db,
      actor,
      { ...entryInput(account.id), category: '교통' },
      randomUUID(),
    );
    const budget = await saveFinanceBudget(db, actor, {
      month: '2026-01',
      category: '식비',
      amount: '2000',
    });
    await saveFinanceBudget(db, actor, { month: '2026-01', category: '식비', amount: '0' });
    const report = await getFinanceOverview(db, actor, '2026-01');
    expect(report.budgets).toHaveLength(1);
    expect(report.budgets[0]).toMatchObject({
      spent: '1000',
      amount: '0',
      remaining: '-1000',
      exceeded: true,
      percent: 100,
    });
    expect(report.expense).toBe('2000');
    await deleteFinanceBudget(db, actor, budget.id);
    expect((await getFinanceOverview(db, actor, '2026-01')).budgets).toHaveLength(0);
  });
  it('금액의 소수·음수·0원·과도한 자릿수와 미래·유효하지 않은 날짜·계좌 이체를 거부한다', async () => {
    const { actor } = await newUser();
    const account = await saveFinanceAccount(db, actor, accountInput());
    for (const amount of ['0', '-1', '0.1', '100,000', '9999999999999999'])
      await expect(
        saveFinanceEntry(db, actor, entryInput(account.id, 'expense', amount), randomUUID()),
      ).rejects.toThrow();
    for (const occurredOn of ['2026-02-30', '2099-12-31'])
      await expect(
        saveFinanceEntry(db, actor, { ...entryInput(account.id), occurredOn }, randomUUID()),
      ).rejects.toThrow();
    await expect(
      saveFinanceEntry(
        db,
        actor,
        entryInput(account.id, 'transfer', '1000', account.id),
        randomUUID(),
      ),
    ).rejects.toThrow();
    await expect(
      saveFinanceEntry(
        db,
        actor,
        { ...entryInput(account.id), workspaceId: randomUUID() },
        randomUUID(),
      ),
    ).rejects.toThrow();
    await expect(getFinanceOverview(db, actor, '2026-13')).rejects.toThrow();
  });
  it('거래·계좌·예산을 개인 공간 소유자에게만 허용하고 공유 백업에서 제외한다', async () => {
    const user = await newUser(),
      other = await newUser();
    const account = await saveFinanceAccount(db, user.actor, accountInput());
    const entry = await saveFinanceEntry(db, user.actor, entryInput(account.id), randomUUID());
    const budget = await saveFinanceBudget(db, user.actor, {
      month: '2026-01',
      category: '식비',
      amount: '1000',
    });
    await addMember(user.workspaceId, other.actor.userId, 'editor');
    expect((await getFinanceOverview(db, other.actor, '2026-01')).total).toBe(0);
    await expect(
      saveFinanceEntry(db, other.actor, entryInput(account.id), randomUUID()),
    ).rejects.toThrow();
    await expect(saveFinanceAccount(db, other.actor, accountInput(), account.id)).rejects.toThrow();
    await expect(setFinanceEntryDeleted(db, other.actor, entry.id, true)).rejects.toThrow();
    await expect(
      saveFinanceEntry(db, other.actor, entryInput(account.id), entry.id, true),
    ).rejects.toThrow();
    await expect(deleteFinanceBudget(db, other.actor, budget.id)).rejects.toThrow();
    const shared = await newSharedWorkspace(user.actor.userId);
    const backup = await exportWorkspaceBackup(db, user.actor, shared);
    expect(backup.tables.financeAccounts).toEqual([]);
    expect(backup.tables.financeEntries).toEqual([]);
    expect(backup.tables.financeBudgets).toEqual([]);
  });
  it('백업 v4는 재정·삭제·보관 상태를 보존하고 잘못된 계좌 연결·소유자를 거부한다', async () => {
    const user = await newUser();
    const account = await saveFinanceAccount(
      db,
      user.actor,
      accountInput('카드', '-10000', 'credit'),
    );
    const entry = await saveFinanceEntry(db, user.actor, entryInput(account.id), randomUUID());
    await setFinanceEntryDeleted(db, user.actor, entry.id, true);
    await archiveFinanceAccount(db, user.actor, account.id, true);
    await saveFinanceBudget(db, user.actor, { month: '2026-01', category: '식비', amount: '1000' });
    const backup = await exportWorkspaceBackup(db, user.actor, user.workspaceId);
    expect(backup.version).toBe(4);
    expect(parseWorkspaceBackup(JSON.stringify(backup))).toEqual(backup);
    expect(backup.tables.financeAccounts![0]).toMatchObject({ openingBalance: '-10000' });
    expect(backup.tables.financeAccounts![0]!.archivedAt).not.toBeNull();
    expect(backup.tables.financeEntries![0]!.deletedAt).not.toBeNull();
    const { sha256: _sha, ...payload } = backup;
    void _sha;
    const wrong = structuredClone(payload);
    wrong.tables.financeEntries![0]!.accountId = randomUUID();
    expect(() => sealWorkspaceBackup(wrong)).toThrow('연결');
    const foreign = structuredClone(payload);
    foreign.tables.financeAccounts![0]!.userId = randomUUID();
    expect(() => sealWorkspaceBackup(foreign)).toThrow('소유자');
    const legacy = structuredClone(payload);
    delete legacy.tables.financeAccounts;
    delete legacy.tables.financeEntries;
    delete legacy.tables.financeBudgets;
    expect(sealWorkspaceBackup({ ...legacy, version: 3 }).version).toBe(3);
  });
  it('숫자 정밀도를 유지하고 새 재정 테이블은 RLS를 사용한다', async () => {
    const { actor } = await newUser();
    for (let i = 0; i < 10; i++)
      await saveFinanceAccount(db, actor, accountInput(`큰 계좌${i}`, '999999999999999'));
    expect((await getFinanceOverview(db, actor, '2026-01')).balance).toBe('9999999999999990');
    const tables = await db.execute<{ relname: string; relrowsecurity: boolean }>(
      sql`select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname in ('finance_accounts', 'finance_entries', 'finance_budgets')`,
    );
    expect(tables).toHaveLength(3);
    expect(tables.every((t) => t.relrowsecurity)).toBe(true);
  });
});
