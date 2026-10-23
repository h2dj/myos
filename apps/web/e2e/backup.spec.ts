import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { parseWorkspaceBackup } from '@myos/domain';
import { signUp } from './helpers';

test('설정에서 현재 공간 업무 데이터를 검증 가능한 JSON으로 다운로드한다', async ({ page }) => {
  const email = await signUp(page);
  await page.goto('/tasks');
  await page.getByLabel('새 할 일 제목').fill('다운로드할 업무');
  await page.getByLabel('새 할 일 제목').press('Enter');
  await expect(
    page.getByRole('checkbox', { name: '다운로드할 업무 완료', exact: true }),
  ).toBeVisible();
  await page.goto('/settings');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: '현재 공간 데이터 내보내기', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^myos-workspace-\d{4}-\d{2}-\d{2}\.json$/);
  const file = await download.path();
  expect(file).not.toBeNull();
  const text = await readFile(file!, 'utf8');
  const backup = parseWorkspaceBackup(text);
  expect(backup.tables.tasks.some((t) => t.title === '다운로드할 업무')).toBe(true);
  expect(text).not.toContain(email);
  expect(Object.keys(backup.tables)).not.toContain('users');
  const response = await page.request.get('/api/workspace-export');
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('private, no-store');
  expect(response.headers()['content-disposition']).toContain('attachment;');
  parseWorkspaceBackup(await response.text());
});

test('로그인하지 않은 사용자는 백업을 받지 못한다', async ({ page }) => {
  const response = await page.request.get('/api/workspace-export', { maxRedirects: 0 });
  expect([302, 303, 307, 308, 401, 403]).toContain(response.status());
  expect(response.headers()['content-disposition']).toBeUndefined();
});
