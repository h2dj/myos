import { expect, test } from '@playwright/test';
import { signUp, uniqueEmail } from './helpers';

test('미로그인 사용자는 로그인 화면으로 이동한다', async ({ page }) => {
  await page.goto('/tasks');
  await expect(page).toHaveURL(/\/login\?next=%2Ftasks/);
});

test('가입 → 로그아웃 → 로그인 시 원래 가려던 화면으로 돌아간다 (AUTH-01)', async ({ page }) => {
  const email = await signUp(page, '지은', uniqueEmail());
  await expect(page.getByRole('heading', { name: /지은님/ })).toBeVisible();

  await page.getByRole('button', { name: '로그아웃' }).first().click();
  await expect(page).toHaveURL(/\/login/);

  await page.goto('/projects');
  await expect(page).toHaveURL(/next=%2Fprojects/);
  await page.getByLabel('이메일').fill(email);
  await page.getByLabel('비밀번호').fill('short');
  expect(
    await page.getByLabel('비밀번호').evaluate((el: HTMLInputElement) => el.validity.valid),
  ).toBe(false);

  await page.getByLabel('비밀번호').fill('password123');
  await page.getByRole('button', { name: '이메일로 로그인' }).click();
  await expect(page).toHaveURL(/\/projects$/);
});

test('위조된 세션 쿠키는 거부된다', async ({ page, context }) => {
  await context.addCookies([
    { name: 'myos-dev-session', value: 'Zm9v.9999999999999.bad', url: 'http://localhost:3200' },
  ]);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
});
