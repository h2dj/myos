import { expect, test } from '@playwright/test';
import { signUp } from './helpers';

test('모바일 메뉴로 이동하면 메뉴가 닫힌다', async ({ page }) => {
  await signUp(page);
  await page.getByRole('button', { name: '메뉴 열기' }).click();
  await page
    .getByRole('navigation', { name: '주 메뉴' })
    .getByRole('link', { name: '인박스' })
    .click();
  await expect(page).toHaveURL(/\/inbox/);
  await expect(page.locator('#app-sidebar')).toBeHidden();
});

for (const width of [320, 390]) {
  test(`모바일 빠른 추가는 제목 입력창을 전체 폭으로 표시한다 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signUp(page);
    await page.goto('/tasks');
    const title = page.getByRole('textbox', { name: '새 할 일 제목' });
    // date input은 브라우저별 역할이 다르므로 label로 찾는다.
    const dateInput = page.getByLabel('예정일', { exact: true });
    const details = page.getByRole('button', { name: '자세히 추가', exact: true });
    const titleBox = (await title.boundingBox())!;
    const formBox = (await title.locator('xpath=ancestor::form').boundingBox())!;
    const dateBox = (await dateInput.boundingBox())!;
    const detailsBox = (await details.boundingBox())!;
    expect(titleBox.width).toBeGreaterThanOrEqual(formBox.width - 2);
    expect(titleBox.width).toBeGreaterThan(250);
    await expect(title).toHaveCSS('font-size', '16px');
    expect(dateBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height);
    expect(Math.abs(dateBox.y - detailsBox.y)).toBeLessThan(2);
    expect(detailsBox.x + detailsBox.width).toBeLessThanOrEqual(width);
    await title.fill('모바일에서 긴 제목을 입력해도 편하게 추가');
    await title.press('Enter');
    await expect(
      page.getByRole('checkbox', {
        name: '모바일에서 긴 제목을 입력해도 편하게 추가 완료',
        exact: true,
      }),
    ).toBeVisible();
    await expect(title).toBeFocused();
    await expect(title).toHaveValue('');
    // 같은 폼 안의 상세 추가 버튼은 빠른 추가를 제출하지 않는다.
    await title.fill('아직 저장하지 않은 제목');
    await details.click();
    await expect(page.getByRole('dialog', { name: '할 일 추가' })).toBeVisible();
    await expect(
      page.getByRole('checkbox', { name: '아직 저장하지 않은 제목 완료', exact: true }),
    ).toHaveCount(0);
  });
}
