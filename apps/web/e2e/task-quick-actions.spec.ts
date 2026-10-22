import { expect, test } from '@playwright/test';
import { signUp, waitForServerAction } from './helpers';

for (const width of [1280, 390]) {
  test(`할 일 빠른 작업: 내일로·내일도·지난 날짜 완료 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signUp(page);
    await page.goto('/tasks');
    const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(
      new Date(Date.now() + 86_400_000),
    );

    async function addPastTask(title: string) {
      await page.getByRole('button', { name: '자세히 추가' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('제목', { exact: true }).fill(title);
      await dialog.getByLabel('예정일').fill('2000-01-01');
      await dialog.getByLabel('메모').fill('복사할 메모');
      await dialog.getByRole('button', { name: '저장', exact: true }).click();
      await expect(dialog).not.toBeVisible();
    }

    await addPastTask('빠른 작업');
    const original = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('button', { name: '빠른 작업', exact: true }) });
    const dateBox = await original.getByText('1월 1일 (토)', { exact: true }).boundingBox();
    const completeBox = await original
      .getByRole('button', { name: '빠른 작업 완료처리', exact: true })
      .boundingBox();
    expect(dateBox).not.toBeNull();
    expect(completeBox).not.toBeNull();
    expect(completeBox!.x + completeBox!.width).toBeLessThanOrEqual(dateBox!.x);
    expect(
      Math.abs(completeBox!.y + completeBox!.height / 2 - dateBox!.y - dateBox!.height / 2),
    ).toBeLessThan(2);
    // 세 버튼은 작은 화면에서도 직접 사용할 수 있다.
    await expect(
      original.getByRole('button', { name: '빠른 작업 완료처리', exact: true }),
    ).toBeEnabled();
    await waitForServerAction(page, () =>
      original.getByRole('button', { name: '빠른 작업 내일도', exact: true }).click(),
    );
    await expect(page.getByRole('button', { name: '빠른 작업', exact: true })).toHaveCount(2);
    await page.reload();
    const past = page
      .getByRole('listitem')
      .filter({ hasText: '1월 1일' })
      .filter({ has: page.getByRole('button', { name: '빠른 작업', exact: true }) });
    await waitForServerAction(page, () =>
      past.getByRole('button', { name: '빠른 작업 내일로', exact: true }).click(),
    );
    const editButtons = page.getByRole('button', { name: '빠른 작업 편집', exact: true });
    await expect(editButtons).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      await editButtons.nth(i).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByLabel('예정일')).toHaveValue(tomorrow);
      await expect(dialog.getByLabel('메모')).toHaveValue('복사할 메모');
      await expect(dialog.getByLabel('상태', { exact: true })).toHaveValue('todo');
      await dialog.getByRole('button', { name: '취소', exact: true }).click();
    }
    await expect(
      page.getByRole('button', { name: '빠른 작업 완료처리', exact: true }).first(),
    ).toBeDisabled();

    await addPastTask('오늘로 이동');
    await waitForServerAction(page, () =>
      page.getByRole('button', { name: '오늘로 이동 오늘로', exact: true }).click(),
    );
    await expect(page.getByRole('button', { name: '오늘로 이동 오늘로', exact: true })).toHaveCount(
      0,
    );
    await page.reload();
    const todaySection = page
      .locator('section')
      .filter({ has: page.getByRole('button', { name: /^오늘 / }) });
    await expect(
      todaySection.getByRole('button', { name: '오늘로 이동', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: '오늘로 이동 편집', exact: true }).click();
    await expect(page.getByRole('dialog').getByLabel('예정일')).toHaveValue(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date()),
    );
    await page.getByRole('dialog').getByRole('button', { name: '취소', exact: true }).click();

    await addPastTask('과거에 완료');
    await waitForServerAction(page, () =>
      page.getByRole('button', { name: '과거에 완료 완료처리', exact: true }).click(),
    );
    await expect(page.getByRole('button', { name: '과거에 완료', exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: '과거에 완료', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '빠른 작업', exact: true })).toHaveCount(2);
  });
}
