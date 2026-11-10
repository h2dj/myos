import { expect, test } from '@playwright/test';
import { signUp, waitForServerAction } from './helpers';

test('할 일 여러 개 선택: 전체 선택·해제·반전 후 속성 일괄 지정', async ({ page }) => {
  await signUp(page);
  await page.goto('/tasks');
  const titleInput = page.getByLabel('새 할 일 제목');
  for (const title of ['일괄 하나', '일괄 둘', '일괄 셋']) {
    await titleInput.fill(title);
    await waitForServerAction(page, () => titleInput.press('Enter'));
    await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible();
  }

  await page.getByRole('button', { name: '여러 개 선택' }).click();
  const bar = page.getByRole('region', { name: '일괄 편집' });
  const box = (title: string) => page.getByRole('checkbox', { name: `${title} 선택`, exact: true });
  await expect(bar.getByText('0/3개 선택')).toBeVisible();

  await bar.getByRole('button', { name: '전체 선택' }).click();
  await expect(bar.getByText('3/3개 선택')).toBeVisible();
  await bar.getByRole('button', { name: '선택 해제' }).click();
  await expect(bar.getByText('0/3개 선택')).toBeVisible();

  await box('일괄 셋').check();
  await bar.getByRole('button', { name: '선택 반전' }).click();
  await expect(box('일괄 하나')).toBeChecked();
  await expect(box('일괄 둘')).toBeChecked();
  await expect(box('일괄 셋')).not.toBeChecked();

  await expect(bar.getByRole('button', { name: '선택한 2개에 적용' })).toBeDisabled();
  await bar.getByLabel('우선순위').selectOption('high');
  await bar.getByLabel('상태').selectOption('in_progress');
  await waitForServerAction(page, () =>
    bar.getByRole('button', { name: '선택한 2개에 적용' }).click(),
  );
  await expect(bar.getByText('2개 할 일에 적용했습니다.')).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('일괄 하나 상태', { exact: true })).toHaveValue('in_progress');
  await expect(page.getByLabel('일괄 둘 상태', { exact: true })).toHaveValue('in_progress');
  await expect(page.getByLabel('일괄 셋 상태', { exact: true })).toHaveValue('todo');
  await expect(page.getByTitle('우선순위 높음')).toHaveCount(2);
});
