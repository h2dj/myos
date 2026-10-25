import { expect, test, type Page } from '@playwright/test';
import { signUp } from './helpers';

async function addAccount(page: Page, name: string, kind: string, opening: string) {
  await page.getByRole('button', { name: '계좌 추가', exact: true }).click();
  const form = page.getByRole('dialog', { name: '계좌 추가', exact: true });
  await form.getByLabel('계좌 이름').fill(name);
  await form.getByLabel('계좌 종류').selectOption(kind);
  await form.getByLabel('기초 잔액 (원)').fill(opening);
  await form.getByRole('button', { name: '계좌 저장' }).click();
  await expect(form).not.toBeVisible();
}
async function addEntry(
  page: Page,
  kind: string,
  account: string,
  amount: string,
  note: string,
  target?: string,
) {
  await page.getByRole('button', { name: '거래 추가', exact: true }).click();
  const form = page.getByRole('dialog', { name: '거래 추가', exact: true });
  await form.getByLabel('거래 종류').selectOption(kind);
  await form
    .getByLabel(kind === 'transfer' ? '출발 계좌' : '거래 계좌')
    .selectOption({ label: account });
  if (target) await form.getByLabel('도착 계좌').selectOption({ label: target });
  else
    await form.getByLabel('카테고리', { exact: true }).fill(kind === 'expense' ? '식비' : '급여');
  await form.getByLabel('금액 (원)', { exact: true }).fill(amount);
  await form.getByLabel('거래 메모').fill(note);
  await form.getByRole('button', { name: '거래 저장' }).click();
  await expect(form).not.toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(note) })).toBeVisible();
}

test('재정: 계좌·수입·카드 지출·이체·예산·수정·삭제·복원', async ({ page }) => {
  await signUp(page);
  await page.goto('/finance');
  await addAccount(page, '생활비', 'bank', '100000');
  await addAccount(page, '생활 카드', 'credit', '-20000');
  await addEntry(page, 'income', '생활비', '50000', '급여 입금');
  await addEntry(page, 'expense', '생활 카드', '5000', '점심 식사');
  await addEntry(page, 'transfer', '생활비', '20000', '카드 대금 결제', '생활 카드');
  const summary = page.getByRole('region', { name: '재정 요약' });
  await expect(summary).toContainText('125,000원');
  await expect(summary).toContainText('45,000원');
  await expect(page.getByRole('article', { name: '생활 카드 계좌' })).toContainText('-5,000원');
  await page.getByRole('button', { name: '예산 추가', exact: true }).click();
  const budget = page.getByRole('dialog', { name: '예산 추가', exact: true });
  await budget.getByLabel('예산 카테고리').fill('식비');
  await budget.getByLabel('예산 금액 (원)').fill('4000');
  await budget.getByRole('button', { name: '예산 저장' }).click();
  await expect(page.getByRole('article', { name: '식비 예산' })).toContainText('1,000원 초과');
  await page.getByRole('button', { name: '점심 식사 거래 수정' }).click();
  const edit = page.getByRole('dialog', { name: '거래 수정', exact: true });
  await edit.getByLabel('금액 (원)', { exact: true }).fill('3000');
  await edit.getByRole('button', { name: '거래 저장' }).click();
  await expect(summary).toContainText('127,000원');
  await expect(page.getByRole('article', { name: '식비 예산' })).toContainText('1,000원 남음');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '점심 식사 거래 삭제' }).click();
  await expect(summary).toContainText('130,000원');
  await page.getByRole('link', { name: '휴지통 보기' }).click();
  await expect(page.getByRole('row', { name: /점심 식사/ })).toBeVisible();
  await page.getByRole('button', { name: '점심 식사 거래 복원' }).click();
  await expect(summary).toContainText('127,000원');
  await page.getByRole('link', { name: '거래 내역 보기' }).click();
  await expect(page.getByRole('row', { name: /점심 식사/ })).toBeVisible();
  await page.getByRole('button', { name: '생활 카드 보관', exact: true }).click();
  await expect(page.getByRole('article', { name: '생활 카드 계좌' })).toContainText('보관 중');
  await expect(summary).toContainText('127,000원');
  await page.reload();
  await expect(summary).toContainText('127,000원');
});
