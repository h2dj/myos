import { expect, test } from '@playwright/test';
import { signUp } from './helpers';

test('할 일 편집에서 이전·후속 작업을 등록하면 프로젝트를 이어받고 양쪽에서 보인다', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/tasks');
  await page.getByRole('button', { name: '자세히 추가' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('제목', { exact: true }).fill('보고서 작성');
  await dialog.getByText('새 프로젝트 만들기').click();
  await dialog.getByLabel('새 프로젝트 이름').fill('연말 정리');
  await dialog.getByRole('button', { name: '프로젝트 등록' }).click();
  await expect(dialog.getByLabel('프로젝트', { exact: true })).not.toHaveValue('');
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(dialog).not.toBeVisible();

  await page.getByRole('button', { name: '보고서 작성 편집', exact: true }).click();
  const panel = page.getByRole('region', { name: '이전·후속 작업' });
  await panel.getByRole('button', { name: '후속 작업 등록' }).click();
  await expect(panel.getByRole('status')).toHaveText('‘보고서 작성 (후속)’ 등록됨');
  await panel.getByRole('button', { name: '이전 작업 등록' }).click();
  await expect(panel.getByRole('link', { name: '보고서 작성 (이전)' })).toBeVisible();
  await panel.getByRole('link', { name: '보고서 작성 (후속)' }).click();

  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]+$/);
  await expect(page.getByLabel('제목', { exact: true })).toHaveValue('보고서 작성 (후속)');
  await expect(page.getByLabel('프로젝트', { exact: true }).locator('option:checked')).toHaveText(
    '연말 정리',
  );
  const detail = page.getByRole('region', { name: '이전·후속 작업' });
  await expect(detail.getByRole('link', { name: '보고서 작성', exact: true })).toBeVisible();
});
