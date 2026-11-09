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

test('로그인 화면에서 비밀번호 찾기로 이동해 재설정을 요청한다', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: '비밀번호를 잊으셨나요?' }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.getByLabel('이메일').fill(uniqueEmail());
  await page.getByRole('button', { name: '재설정 링크 받기' }).click();
  await expect(page.getByRole('status')).toContainText('개발 모드에서는 메일을 보내지 않습니다');
});

test('새 비밀번호는 로그인해야 정할 수 있고, 확인 값이 다르면 거부된다', async ({ page }) => {
  await page.goto('/reset-password');
  await expect(page).toHaveURL(/\/login\?next=%2Freset-password/);

  await signUp(page);
  await page.goto('/settings');
  await page.getByRole('link', { name: '비밀번호 변경' }).click();
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.getByLabel('새 비밀번호', { exact: true }).fill('newpassword1');
  await page.getByLabel('새 비밀번호 확인').fill('different1');
  await page.getByRole('button', { name: '비밀번호 변경' }).click();
  await expect(page.getByText('두 비밀번호가 일치하지 않습니다.')).toBeVisible();

  await page.getByLabel('새 비밀번호', { exact: true }).fill('newpassword1');
  await page.getByLabel('새 비밀번호 확인').fill('newpassword1');
  await page.getByRole('button', { name: '비밀번호 변경' }).click();
  await expect(page.getByRole('status')).toContainText(
    '개발 모드에서는 비밀번호를 저장하지 않습니다',
  );
});
