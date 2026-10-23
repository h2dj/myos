import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { parseWorkspaceBackup } from '@myos/domain';
import { signUp } from './helpers';

for (const width of [1280, 390]) {
  test(`Notion 파일 매핑·미리보기·표본 저장·중복 방지 (${width}px)`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 });
    await signUp(page);
    await page.goto('/settings');
    await page.getByRole('link', { name: 'Notion 파일 가져오기', exact: true }).click();
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    const title = `Notion 검증 ${ids[0]!.slice(0, 8)}`;
    const csv = `id,이름,완료,완료일,예정일,태그,메모\n${ids[0]},${title},false,,2026-10-23,"P1,오늘,업무",본문\n${ids[1]},지난 완료 기록,true,2025-02-01,2025-02-01,기록,과거 완료일 보존\n${ids[2]},잘못된 날짜,false,,2026-99-99,,오류 행\n`;
    await page
      .getByLabel('Notion 파일', { exact: true })
      .setInputFiles({ name: 'notion.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(page.getByLabel('Notion 페이지 ID / URL', { exact: true })).toHaveValue('id');
    await page.getByRole('button', { name: '매핑 미리보기', exact: true }).click();
    const preview = page.getByRole('region', { name: '가져오기 미리보기' });
    await expect(preview.getByRole('heading')).toContainText('신규 2건');
    await expect(page.getByRole('checkbox', { name: '3행 선택', exact: true })).toBeDisabled();
    const otherPage = await context.newPage();
    await otherPage.goto(`/search?q=${encodeURIComponent(title)}&type=task`);
    await expect(otherPage.getByText('검색 결과가 없습니다.', { exact: true })).toBeVisible();
    await otherPage.close();
    await page.getByText('변환 값 확인', { exact: true }).first().click();
    await expect(preview.getByText('todo / high', { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const commit = page.getByRole('button', { name: '선택한 2건 가져오기', exact: true });
    await expect(commit).toBeDisabled();
    await page.getByLabel('선택한 행의 변환 값과 연결을 확인했습니다.').check();
    await commit.click();
    const result = page.getByRole('status');
    await expect(result).toContainText('저장 2건 · 건너뛰기 0건 · 실패 0건');
    await expect(preview.getByText('중복 건너뛰기', { exact: false })).toHaveCount(2);
    await expect(
      page.getByRole('button', { name: '선택한 0건 가져오기', exact: true }),
    ).toBeDisabled();
    const response = await page.request.get('/api/workspace-export');
    expect(response.ok()).toBe(true);
    const backup = parseWorkspaceBackup(await response.text());
    expect(backup.tables.externalRefs).toHaveLength(2);
    expect(backup.tables.externalRefs?.find((r) => r.externalId === ids[0])?.raw.메모).toBe('본문');
    expect(
      backup.tables.tasks.find((t) => t.title === '지난 완료 기록')?.completedAt?.slice(0, 4),
    ).toBe('2025');
    // Changing a mapping invalidates the old preview and its confirmation.
    await page.getByLabel('메모 / 설명', { exact: true }).selectOption('');
    await expect(preview).toHaveCount(0);
    await page.getByRole('button', { name: '매핑 미리보기', exact: true }).click();
    await expect(page.getByText('변경됨 · 덮어쓰기 안 함', { exact: false })).toHaveCount(2);
    await page.goto(`/search?q=${encodeURIComponent(title)}&type=task`);
    await page
      .getByRole('link')
      .filter({ has: page.getByText(title, { exact: true }) })
      .click();
    await expect(page.getByLabel('제목', { exact: true })).toHaveValue(title);
  });
}

test('Notion 가져오기는 로그인 후 사용할 수 있다', async ({ page }) => {
  await page.goto('/settings/notion');
  await expect(page).toHaveURL(/\/login/);
});
