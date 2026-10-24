import { expect, test } from '@playwright/test';
import { signUp } from './helpers';

test('캘린더 날짜별 추가·마감 표시·주간 전환·편집', async ({ page }) => {
  await signUp(page);
  await page.goto('/tasks?view=calendar&date=2026-10-25');
  await page.getByRole('button', { name: '2026-10-25 할 일 추가', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: '할 일 추가' }).getByLabel('예정일', { exact: true }),
  ).toHaveValue('2026-10-25');
  await page.getByLabel('제목', { exact: true }).fill('캘린더 검증');
  await page.getByLabel('마감일', { exact: true }).fill('2026-10-28');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  const calendar = page.getByRole('region', { name: '할 일 캘린더', exact: true });
  await expect(calendar.getByRole('button', { name: /캘린더 검증/ })).toHaveCount(2);
  await page.getByRole('link', { name: '주간', exact: true }).click();
  await expect(calendar.getByRole('button', { name: /캘린더 검증/ })).toHaveCount(2);
  await calendar
    .getByRole('button', { name: /캘린더 검증/ })
    .first()
    .click();
  await page.getByLabel('제목', { exact: true }).fill('일정 수정');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(calendar.getByRole('button', { name: /일정 수정/ })).toHaveCount(2);
  await page.getByRole('link', { name: '다음 기간' }).click();
  await expect(calendar.getByRole('button', { name: /일정 수정/ })).toHaveCount(0);
});
