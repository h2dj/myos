import { expect, type Page } from '@playwright/test';

export function uniqueEmail(prefix = 'e2e') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.local`;
}

export async function signUp(page: Page, name = '지은', email = uniqueEmail()) {
  await page.goto('/signup');
  await page.getByLabel('이름').fill(name);
  await page.getByLabel('이메일').fill(email);
  await page.getByLabel('비밀번호').fill('password123');
  await page.getByRole('button', { name: '회원가입' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  return email;
}
