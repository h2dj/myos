import { expect, test } from '@playwright/test';
import { signUp } from './helpers';
for (const mobile of [false, true]) {
  test(`재정 예정: 반복·기간·제외·실제 확정 ${mobile ? '모바일' : '데스크톱'}`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await signUp(page);
    await page.goto('/finance');
    await page.getByRole('button', { name: '계좌 추가', exact: true }).click();
    const account = page.getByRole('dialog', { name: '계좌 추가', exact: true });
    await account.getByLabel('계좌 이름').fill('생활비');
    await account.getByLabel('기초 잔액 (원)').fill('100000');
    await account.getByRole('button', { name: '계좌 저장' }).click();
    await expect(account).not.toBeVisible();
    await page.getByRole('link', { name: '고정 지출·예정 수입·수지 예측 →' }).click();
    await page.getByRole('button', { name: '고정 지출 추가', exact: true }).click();
    const form = page.getByRole('dialog', { name: '고정 지출 추가', exact: true });
    await form.getByLabel('예정 이름').fill('월세');
    await form.getByLabel('예정 금액 (원)').fill('30000');
    const today = await form.getByLabel('첫 예정일').inputValue();
    await expect(form.getByLabel('반복 주기')).toHaveValue('monthly');
    await form.getByRole('button', { name: '예정 저장' }).click();
    await expect(form).not.toBeVisible();
    await page.getByRole('button', { name: '예정 수입·지출 추가', exact: true }).click();
    const income = page.getByRole('dialog', { name: '예정 수입·지출 추가', exact: true });
    await income.getByLabel('예정 이름').fill('추가 수입');
    await income.getByLabel('예정 종류').selectOption('income');
    await income.getByLabel('예정 금액 (원)').fill('10000');
    await income.getByRole('button', { name: '예정 저장' }).click();
    await expect(income).not.toBeVisible();
    const summary = page.getByRole('region', { name: '수지 예측 결과' });
    await expect(summary).toContainText('80,000원');
    await page.getByLabel('예측 기간 옵션').selectOption('custom');
    await page.getByLabel('예측 기준 날짜').fill(today);
    await page.getByRole('button', { name: '수지 예측 조회' }).click();
    await expect(page).toHaveURL(/period=custom/);
    await page.getByRole('button', { name: `월세 ${today} 제외`, exact: true }).click();
    await expect(summary).toContainText('110,000원');
    await page.getByRole('button', { name: `월세 ${today} 제외 취소`, exact: true }).click();
    await expect(summary).toContainText('80,000원');
    await page.getByRole('button', { name: `월세 ${today} 확정`, exact: true }).click();
    const posting = page.getByRole('dialog', { name: '예정 거래 확정' });
    await posting.getByRole('button', { name: '거래로 확정' }).click();
    await expect(posting).not.toBeVisible();
    await expect(summary).toContainText('80,000원');
    await expect(page.getByText('확정됨 · 예정 제외')).toBeVisible();
    await page.reload();
    await expect(summary).toContainText('80,000원');
  });
}
