import { expect, test } from '@playwright/test';
import { signUp, waitForServerAction } from './helpers';

test('지난 할 일을 한 번에 완료처리한다', async ({ page }) => {
  await signUp(page);
  await page.goto('/tasks');

  for (const title of ['밀린 일 1', '밀린 일 2']) {
    await page.getByRole('button', { name: '자세히 추가' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('제목', { exact: true }).fill(title);
    await dialog.getByLabel('예정일').fill('2000-01-01');
    await dialog.getByRole('button', { name: '저장', exact: true }).click();
    await expect(dialog).not.toBeVisible();
  }
  await expect(page.getByRole('button', { name: '밀린 일 2', exact: true })).toBeVisible();

  await page.getByRole('button', { name: '모두 완료처리' }).click();
  await page.getByRole('button', { name: '취소' }).click();
  await expect(page.getByRole('button', { name: '밀린 일 1', exact: true })).toBeVisible();

  await page.getByRole('button', { name: '모두 완료처리' }).click();
  await waitForServerAction(page, () => page.getByRole('button', { name: '2개 완료' }).click());
  await page.reload();
  await expect(page.getByRole('button', { name: /밀린 일/ })).toHaveCount(0);
  await expect(page.getByText('지난 할 일')).toHaveCount(0);
});
