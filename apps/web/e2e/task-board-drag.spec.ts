import { expect, test } from '@playwright/test';
import { signUp, waitForServerAction } from './helpers';

test('할 일 보드에서 카드를 끌어다 놓아 상태를 바꾼다', async ({ page }) => {
  await signUp(page);
  await page.goto('/tasks?view=board');
  await page.getByRole('button', { name: '자세히 추가' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('제목', { exact: true }).fill('끌어서 옮길 일');
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(dialog).not.toBeVisible();

  const column = (name: string) => page.getByRole('region', { name, exact: true });
  const card = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: '끌어서 옮길 일', exact: true }) });
  await expect(column('할 일').getByText('끌어서 옮길 일')).toBeVisible();

  await waitForServerAction(page, () => card.dragTo(column('진행 중')));
  await expect(column('진행 중').getByText('끌어서 옮길 일')).toBeVisible();
  await expect(column('할 일').getByText('끌어서 옮길 일')).toHaveCount(0);

  await waitForServerAction(page, () => card.dragTo(column('완료')));
  await expect(column('완료').getByText('끌어서 옮길 일')).toBeVisible();

  await page.reload();
  await expect(column('완료').getByText('끌어서 옮길 일')).toBeVisible();
  await expect(card.getByLabel('끌어서 옮길 일 상태')).toHaveValue('done');
});
