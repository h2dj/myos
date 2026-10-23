import { expect, test } from '@playwright/test';
import { signUp, waitForServerAction } from './helpers';

for (const width of [1280, 390]) {
  test(`프로젝트 중첩·편집 중 등록·목록 상태·상시 활동 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signUp(page);
    await page.goto('/activities');
    await page.getByRole('button', { name: '활동처 추가', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('이름', { exact: true }).fill('공동체IT');
    await dialog.getByRole('button', { name: '저장', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole('button', { name: '사업·활동 추가', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('이름', { exact: true }).fill('상시 운영');
    await dialog.getByLabel('기본 활동처').selectOption({ label: '공동체IT' });
    await dialog.getByRole('button', { name: '저장', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText('상시 운영', { exact: true })).toBeVisible();

    await page.goto('/projects');
    await page.getByRole('button', { name: '프로젝트 추가', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('이름', { exact: true }).fill('상위 사업');
    await dialog.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page.getByRole('heading', { name: '상위 사업', exact: true })).toBeVisible();
    const parentUrl = page.url();
    await page.goto('/projects');
    await page.getByRole('button', { name: '프로젝트 추가', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('이름', { exact: true }).fill('하위 프로젝트');
    await dialog.getByLabel('상위 프로젝트').selectOption({ label: '상위 사업' });
    await dialog.getByRole('button', { name: '저장', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: '하위 프로젝트', level: 1, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: '상위 사업', exact: true })).toBeVisible();
    await page.goto(parentUrl);
    await expect(
      page
        .getByRole('region', { name: '하위 프로젝트' })
        .getByRole('link', { name: '하위 프로젝트', exact: true }),
    ).toBeVisible();

    await page.goto('/tasks');
    const quick = page.getByLabel('새 할 일 제목');
    await quick.fill('연결할 할 일');
    await quick.press('Enter');
    await expect(
      page.getByRole('checkbox', { name: '연결할 할 일 완료', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: '연결할 할 일 편집', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('메모').fill('편집 중 작성한 내용');
    await dialog.getByText('새 프로젝트 만들기', { exact: true }).click();
    await dialog.getByLabel('새 프로젝트 이름').fill('편집 중 새 프로젝트');
    await dialog.getByRole('button', { name: '프로젝트 등록', exact: true }).click();
    await expect(
      dialog.getByLabel('프로젝트', { exact: true }).locator('option:checked'),
    ).toHaveText('편집 중 새 프로젝트');
    await expect(dialog.getByLabel('메모')).toHaveValue('편집 중 작성한 내용');
    await dialog.getByLabel('상시 사업·활동').selectOption({ label: '상시 운영' });
    await expect(dialog.getByLabel('활동처', { exact: true }).locator('option:checked')).toHaveText(
      '공동체IT',
    );
    await dialog.getByRole('button', { name: '저장', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: '연결할 할 일 편집', exact: true }).click();
    dialog = page.getByRole('dialog');
    await expect(
      dialog.getByLabel('프로젝트', { exact: true }).locator('option:checked'),
    ).toHaveText('편집 중 새 프로젝트');
    await expect(dialog.getByLabel('상시 사업·활동').locator('option:checked')).toHaveText(
      '상시 운영',
    );
    await expect(dialog.getByLabel('활동처', { exact: true }).locator('option:checked')).toHaveText(
      '공동체IT',
    );
    await dialog.getByRole('button', { name: '취소', exact: true }).click();
    const status = page.getByRole('combobox', { name: '연결할 할 일 상태', exact: true });
    await waitForServerAction(page, () => status.selectOption('in_progress').then(() => {}));
    await expect(status).toBeEnabled();
    await page.reload();
    await expect(status).toHaveValue('in_progress');
    await waitForServerAction(page, () => status.selectOption('done').then(() => {}));
    await expect(status).toBeEnabled();
    await page.reload();
    await expect(status).toHaveValue('done');
    await waitForServerAction(page, () => status.selectOption('todo').then(() => {}));
    await expect(status).toBeEnabled();
    await page.reload();
    await expect(status).toHaveValue('todo');
  });
}
