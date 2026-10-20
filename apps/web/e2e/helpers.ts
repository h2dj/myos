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

/** 낙관적 UI는 서버 저장 전에 바로 바뀌므로, 새로고침 전에는 서버 액션 응답까지 기다린다 */
export async function waitForServerAction(page: Page, act: () => Promise<void>) {
  const saved = page.waitForResponse(
    (r) => r.request().method() === 'POST' && !!r.request().headers()['next-action'],
  );
  await act();
  await saved;
}
