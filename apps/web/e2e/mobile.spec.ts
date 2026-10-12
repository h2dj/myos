import { expect, test } from '@playwright/test';
import { signUp } from './helpers';

test('모바일 메뉴로 이동하면 메뉴가 닫힌다', async ({ page }) => {
  await signUp(page);
  await page.getByRole('button', { name: '메뉴 열기' }).click();
  await page.getByRole('link', { name: '인박스' }).click();
  await expect(page).toHaveURL(/\/inbox/);
  await expect(page.locator('#app-sidebar')).toBeHidden();
});
