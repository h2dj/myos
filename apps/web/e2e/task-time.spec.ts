import { expect, test } from '@playwright/test';
import { signUp } from './helpers';

test('할 일에 예정·마감 시간을 선택 입력하고, 비우면 날짜만 남는다', async ({ page }) => {
  await signUp(page);
  await page.goto('/tasks?view=calendar&date=2026-10-25');
  await page.getByRole('button', { name: '2026-10-25 할 일 추가', exact: true }).click();
  await page.getByLabel('제목', { exact: true }).fill('시간 지정');
  await page.getByLabel('예정 시간 (선택)', { exact: true }).fill('09:30');
  await page.getByLabel('마감일', { exact: true }).fill('2026-10-27');
  await page.getByLabel('마감 시간 (선택)', { exact: true }).fill('18:00');
  await page.getByRole('button', { name: '저장', exact: true }).click();

  const calendar = page.getByRole('region', { name: '할 일 캘린더', exact: true });
  await expect(calendar.getByRole('button', { name: '09:30 시간 지정' })).toBeVisible();
  await expect(calendar.getByRole('button', { name: '마감 18:00 시간 지정' })).toBeVisible();

  // 다시 열면 시간이 그대로 보이고, 지우면 종일·날짜만 마감으로 돌아간다
  await calendar.getByRole('button', { name: '09:30 시간 지정' }).click();
  await expect(page.getByLabel('예정 시간 (선택)', { exact: true })).toHaveValue('09:30');
  await expect(page.getByLabel('마감 시간 (선택)', { exact: true })).toHaveValue('18:00');
  await page.getByLabel('예정 시간 (선택)', { exact: true }).fill('');
  await page.getByLabel('마감 시간 (선택)', { exact: true }).fill('');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(calendar.getByRole('button', { name: '종일 시간 지정' })).toBeVisible();
  await expect(calendar.getByRole('button', { name: '마감 시간 지정', exact: true })).toBeVisible();
});
