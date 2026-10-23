import { expect, test } from '@playwright/test';
import { signUp, waitForServerAction } from './helpers';

for (const width of [1280, 390]) {
  test(`통합 검색에서 지난 완료 할 일을 찾아 편집하고 URL로 필터를 유지한다 (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await signUp(page);
    await page.goto('/tasks');
    const title = '검색 100%_ 모바일';
    await page.getByRole('textbox', { name: '새 할 일 제목' }).fill(title);
    await waitForServerAction(page, () =>
      page.getByRole('textbox', { name: '새 할 일 제목' }).press('Enter'),
    );
    await page.goto('/search');
    await page.getByRole('textbox', { name: '검색어' }).fill('100%_');
    await page.getByRole('combobox', { name: '종류', exact: true }).selectOption('task');
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await expect(page).toHaveURL(/type=task/);
    await page.reload();
    await expect(page.getByRole('textbox', { name: '검색어' })).toHaveValue('100%_');
    await expect(page.getByRole('combobox', { name: '종류', exact: true })).toHaveValue('task');
    const box = (await page.getByRole('textbox', { name: '검색어' }).boundingBox())!;
    expect(box.width).toBeGreaterThan(width < 500 ? 300 : 600);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page
      .getByRole('link')
      .filter({ has: page.getByText(title, { exact: true }) })
      .click();
    await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]+$/);
    await page.getByLabel('예정일', { exact: true }).fill('2000-01-01');
    await page.getByLabel('상태', { exact: true }).selectOption('done');
    await waitForServerAction(page, () =>
      page.getByRole('button', { name: '저장', exact: true }).click(),
    );
    await expect(page.getByRole('status')).toHaveText('저장했습니다.');
    await page.goto('/search?q=100%25_&type=task');
    await page
      .getByRole('link')
      .filter({ has: page.getByText(title, { exact: true }) })
      .click();
    await expect(page.getByLabel('상태', { exact: true })).toHaveValue('done');
    await page.getByRole('button', { name: '취소', exact: true }).click();
    await expect(page).toHaveURL(/\/search$/);
    await expect(page.getByRole('status')).toHaveCount(0);
    await page.goto('/search?project=invalid');
    await expect(page.getByRole('alert').filter({ hasText: '필터를 다시 선택' })).toBeVisible();
  });
}
