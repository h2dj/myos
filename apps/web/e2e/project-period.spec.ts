import { expect, test } from '@playwright/test';
import { signUp } from './helpers';
for (const mobile of [false, true]) {
  test(`프로젝트 기간 빠른 선택과 할 일 프로젝트 링크 ${mobile ? '모바일' : '데스크톱'}`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await signUp(page);
    await page.goto('/projects');
    await page.getByRole('button', { name: '프로젝트 추가', exact: true }).click();
    const form = page.getByRole('dialog', { name: '프로젝트 추가', exact: true });
    await form.getByLabel('이름', { exact: true }).fill('연간 계획');
    await form.getByLabel('설명').fill('프로젝트 상세 정보 확인');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
    const year = Number(today.slice(0, 4));
    await form.getByRole('button', { name: '올해', exact: true }).click();
    await expect(form.getByLabel('시작일')).toHaveValue(`${year}-01-01`);
    await expect(form.getByLabel('마감일')).toHaveValue(`${year}-12-31`);
    await form.getByRole('button', { name: '내년', exact: true }).click();
    await expect(form.getByLabel('시작일')).toHaveValue(`${year + 1}-01-01`);
    await expect(form.getByLabel('마감일')).toHaveValue(`${year + 1}-12-31`);
    await form.getByRole('button', { name: '이번 달', exact: true }).click();
    await expect(form.getByLabel('시작일')).toHaveValue(`${today.slice(0, 7)}-01`);
    const lastDay = new Date(Date.UTC(year, Number(today.slice(5, 7)), 0, 12))
      .toISOString()
      .slice(0, 10);
    await expect(form.getByLabel('마감일')).toHaveValue(lastDay);
    await form.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    const projectUrl = page.url();
    await page.getByRole('button', { name: '편집', exact: true }).click();
    const edit = page.getByRole('dialog', { name: '프로젝트 편집' });
    await expect(edit.getByLabel('마감일')).toHaveValue(lastDay);
    await edit.getByRole('button', { name: '내년', exact: true }).click();
    await edit.getByLabel('마감일').fill(`${year + 1}-11-30`);
    await edit.getByRole('button', { name: '저장', exact: true }).click();
    await expect(edit).not.toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: '편집', exact: true }).click();
    await expect(edit.getByLabel('시작일')).toHaveValue(`${year + 1}-01-01`);
    await expect(edit.getByLabel('마감일')).toHaveValue(`${year + 1}-11-30`);
    await edit.getByRole('button', { name: '취소', exact: true }).click();
    await page.getByLabel('새 할 일 제목').fill('프로젝트 연결 작업');
    await page.getByLabel('새 할 일 제목').press('Enter');
    await expect(
      page.getByRole('checkbox', { name: '프로젝트 연결 작업 완료', exact: true }),
    ).toBeVisible();
    for (const view of ['list', 'board']) {
      await page.goto(`/tasks?view=${view}`);
      await page.getByRole('link', { name: '연간 계획', exact: true }).click();
      await expect(page).toHaveURL(projectUrl);
      await expect(page.getByRole('heading', { name: '연간 계획', exact: true })).toBeVisible();
      await expect(page.getByText('프로젝트 상세 정보 확인', { exact: true })).toBeVisible();
    }
  });
}
