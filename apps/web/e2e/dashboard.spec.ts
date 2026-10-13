import { expect, test, type Page } from '@playwright/test';
import { signUp } from './helpers';

const widget = (page: Page, name: string) => page.getByRole('article', { name, exact: true });

test('위젯 구성이 재접속 후에도 유지된다 (인수 테스트 #1, DASH-02)', async ({ page }) => {
  const email = await signUp(page);
  await page.getByRole('button', { name: '대시보드 편집' }).click();

  // 추가: 바로가기 위젯이 하나 더 생긴다
  await expect(widget(page, '바로가기')).toHaveCount(1);
  await page.getByRole('button', { name: '위젯 추가' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^바로가기/ })
    .click();
  await expect(widget(page, '바로가기')).toHaveCount(2);

  // 숨기기, 순서 이동, 설정(제목 변경)
  await page.getByRole('button', { name: '최근 메모 숨기기' }).click();
  await expect(page.getByRole('button', { name: '최근 메모 표시' })).toBeVisible();
  await page.getByRole('button', { name: '프로젝트 현황 앞으로 이동' }).click();
  await page.getByRole('button', { name: '할 일 목록 설정' }).click();
  await page.getByRole('dialog').getByLabel('제목').fill('오늘의 할 일');
  await page.getByRole('dialog').getByRole('button', { name: '저장', exact: true }).click();
  await expect(widget(page, '오늘의 할 일')).toBeVisible();
  await page.getByRole('button', { name: '이번 주', exact: true }).click();
  await expect(page.getByRole('button', { name: '이번 주', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '편집 완료' }).click();

  const layout = await page
    .getByRole('article')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  expect(layout).not.toContain('최근 메모');

  // 재접속
  await page.getByRole('button', { name: '로그아웃' }).first().click();
  await page.getByLabel('이메일').fill(email);
  await page.getByLabel('비밀번호').fill('password123');
  await page.getByRole('button', { name: '이메일로 로그인' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  const after = await page
    .getByRole('article')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  expect(after).toEqual(layout);
  await expect(page.getByRole('button', { name: '이번 주', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('할 일 상태를 바꾸면 대시보드 수치가 갱신된다 (인수 테스트 #2)', async ({ page }) => {
  await signUp(page);
  // KPI '오늘 할 일'에 데이터 소스 연결
  await page.getByRole('button', { name: '대시보드 편집' }).click();
  await page.getByRole('button', { name: '오늘 할 일 설정' }).click();
  await page.getByLabel('데이터 소스').selectOption('tasks.progress');
  await page.getByRole('dialog').getByRole('button', { name: '저장', exact: true }).click();
  await page.getByRole('button', { name: '편집 완료' }).click();
  await expect(widget(page, '오늘 할 일')).toContainText('0 / 0');
  await expect(widget(page, '이번 주 집중 시간')).toContainText('데이터 소스 미설정');

  // 할 일 화면에서 오늘 할 일 2개 추가
  await page.goto('/tasks');
  for (const title of ['기획서 초안', '운동 30분']) {
    await page.getByLabel('새 할 일 제목').fill(title);
    await page.getByLabel('새 할 일 제목').press('Enter');
    await expect(page.getByRole('checkbox', { name: `${title} 완료` })).toBeVisible();
  }
  await page.goto('/dashboard');
  await expect(widget(page, '할 일 목록')).toContainText('0/2');
  await expect(widget(page, '오늘 할 일')).toContainText('0 / 2');

  // 대시보드 위젯에서 바로 완료
  await widget(page, '할 일 목록').getByRole('checkbox', { name: '운동 30분 완료' }).check();
  await expect(widget(page, '할 일 목록')).toContainText('1/2');
  await expect(widget(page, '오늘 할 일')).toContainText('1 / 2');

  // 할 일 화면에서 바꿔도 반영
  await page.goto('/tasks');
  await page.getByRole('checkbox', { name: '기획서 초안 완료' }).check();
  await expect(page.getByRole('checkbox', { name: '기획서 초안 완료 취소' })).toBeChecked();
  await page.goto('/dashboard');
  await expect(widget(page, '오늘 할 일')).toContainText('2 / 2');
});

test('대시보드 빠른 기록이 인박스 위젯 수치에 반영된다 (INBOX-01)', async ({ page }) => {
  await signUp(page);
  const inbox = widget(page, '메모 / 빠른 기록');
  await inbox.getByRole('textbox', { name: '빠른 기록' }).fill('카페 메뉴 아이디어');
  await inbox.getByRole('button', { name: '인박스에 저장' }).click();
  await expect(inbox).toContainText('분류 대기 1개');
});
