import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { utcToLocalDate } from '@myos/core';
import {
  saveFinanceAccount,
  saveFinancePlan,
  getFinanceForecast,
  postFinancePlan,
  skipFinancePlan,
  pauseFinancePlan,
  setFinanceEntryDeleted,
  exportWorkspaceBackup,
  parseWorkspaceBackup,
  listFinancePlans,
} from '../src';
import { db, newUser } from './helpers';
const today = utcToLocalDate(new Date(), 'Asia/Seoul');
async function setup() {
  const user = await newUser();
  const account = await saveFinanceAccount(db, user.actor, {
    name: '은행',
    kind: 'bank',
    openingBalance: '10000',
  });
  const input = {
    title: '월세',
    kind: 'expense',
    accountId: account.id,
    targetAccountId: null,
    amount: '3000',
    frequency: 'monthly',
    startOn: today,
    endOn: null,
    category: '주거',
    note: '',
  };
  const plan = await saveFinancePlan(db, user.actor, input, randomUUID());
  return { ...user, account, input, plan };
}
const window = { period: 'custom', until: today };
describe('개인 재정 예정', () => {
  it('동일 회차 동시 확정을 한 거래로 처리하고 삭제·복원도 중복 합산하지 않는다', async () => {
    const { actor, plan, workspaceId } = await setup();
    expect((await getFinanceForecast(db, actor, window)).summary).toMatchObject({
      opening: '10000',
      expense: '3000',
      closing: '7000',
    });
    const [a, b] = await Promise.all([
      postFinancePlan(db, actor, plan.id, today, { amount: '2500', occurredOn: today }),
      postFinancePlan(db, actor, plan.id, today, { amount: '2500', occurredOn: today }),
    ]);
    expect(a.id).toBe(b.id);
    expect((await getFinanceForecast(db, actor, window)).summary).toMatchObject({
      opening: '7500',
      expense: '0',
      closing: '7500',
    });
    await setFinanceEntryDeleted(db, actor, a.id, true);
    let forecast = await getFinanceForecast(db, actor, window);
    expect(forecast.summary).toMatchObject({ opening: '10000', expense: '2500', closing: '7500' });
    expect(forecast.flows[0]?.restoring).toBe(true);
    await skipFinancePlan(db, actor, plan.id, today, true);
    expect((await getFinanceForecast(db, actor, window)).summary.expense).toBe('0');
    await skipFinancePlan(db, actor, plan.id, today, false);
    expect(
      (await postFinancePlan(db, actor, plan.id, today, { amount: '999', occurredOn: today })).id,
    ).toBe(a.id);
    forecast = await getFinanceForecast(db, actor, window);
    expect(forecast.summary.closing).toBe('7500');
    expect(forecast.flows[0]?.amount).toBe('2500');
    const backup = await exportWorkspaceBackup(db, actor, workspaceId);
    expect(backup.version).toBe(6);
    expect(backup.tables.financePlans).toHaveLength(1);
    expect(backup.tables.financePlanOutcomes).toHaveLength(1);
    expect(() => parseWorkspaceBackup(JSON.stringify(backup))).not.toThrow();
  });
  it('제외·중지·기간 검증과 개인 간 접근 차단을 적용한다', async () => {
    const { actor, plan, input } = await setup();
    await skipFinancePlan(db, actor, plan.id, today, true);
    expect((await getFinanceForecast(db, actor, window)).summary.closing).toBe('10000');
    await expect(
      saveFinancePlan(db, actor, { ...input, frequency: 'yearly' }, plan.id, true),
    ).rejects.toThrow();
    await skipFinancePlan(db, actor, plan.id, today, false);
    await pauseFinancePlan(db, actor, plan.id, true);
    expect((await getFinanceForecast(db, actor, window)).summary.expense).toBe('0');
    await pauseFinancePlan(db, actor, plan.id, false);
    expect((await getFinanceForecast(db, actor, window)).summary.expense).toBe('3000');
    const other = await newUser();
    expect((await listFinancePlans(db, other.actor)).total).toBe(0);
    await expect(
      postFinancePlan(db, other.actor, plan.id, today, { amount: '3000', occurredOn: today }),
    ).rejects.toThrow();
    await expect(
      getFinanceForecast(db, actor, { period: 'custom', until: '1900-01-01' }),
    ).rejects.toThrow();
    await expect(
      postFinancePlan(db, actor, plan.id, today, { amount: '3000', occurredOn: '2099-12-31' }),
    ).rejects.toThrow();
  });
});
