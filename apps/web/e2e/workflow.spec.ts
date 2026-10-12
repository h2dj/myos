import { expect, test } from '@playwright/test';
import { signUp } from './helpers';

test('인박스 → 할 일 변환 → 완료·삭제·복구 (INBOX-01, TASK-01)', async ({ page }) => {
  await signUp(page);

  // 대시보드 빠른 기록 → 인박스에 즉시 반영
  await page.getByRole('textbox', { name: '빠른 기록' }).fill('회의 준비\n자료 출력');
  await page.getByRole('button', { name: '인박스에 저장' }).click();
  await expect(page.getByText('인박스에 저장했습니다')).toBeVisible();

  await page
    .getByRole('navigation', { name: '주 메뉴' })
    .getByRole('link', { name: '인박스' })
    .click();
  await expect(page.getByText('회의 준비')).toBeVisible();
  await page.getByRole('button', { name: '할 일', exact: true }).click();
  await expect(page.getByText('모두 분류했습니다')).toBeVisible();

  // 할 일 화면: 변환된 항목은 날짜가 없어 '언젠가'(접힘)에 있다
  await page.goto('/tasks');
  await page.getByRole('button', { name: /언젠가/ }).click();
  await expect(page.getByRole('button', { name: '회의 준비', exact: true })).toBeVisible();

  // 빠른 추가 (오늘)
  await page.getByLabel('새 할 일 제목').fill('운동 30분');
  await page.getByLabel('새 할 일 제목').press('Enter');
  const todayRow = page.getByRole('checkbox', { name: '운동 30분 완료' });
  await expect(todayRow).toBeVisible();

  // 완료 토글 → 새로고침 후에도 유지
  await todayRow.check();
  await expect(page.getByRole('checkbox', { name: '운동 30분 완료 취소' })).toBeChecked();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: '운동 30분 완료 취소' })).toBeChecked();

  // 편집 → 휴지통 → 복구
  await page.getByRole('button', { name: '운동 30분 편집' }).click();
  await page.getByRole('button', { name: '휴지통으로 이동' }).click();
  await expect(page.getByRole('button', { name: '운동 30분', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: '휴지통' }).click();
  await page.getByRole('button', { name: '복구' }).click();
  await expect(page.getByText('휴지통이 비어 있습니다')).toBeVisible();
  await page.getByRole('tab', { name: '목록' }).click();
  await expect(page.getByRole('button', { name: '운동 30분', exact: true })).toBeVisible();
});

test('프로젝트 생성 → 할 일 연결 → 진행률 (PROJ-01)', async ({ page }) => {
  await signUp(page);
  await page.goto('/projects');
  await page.getByRole('button', { name: '프로젝트 추가' }).click();
  await page.getByLabel('이름').fill('웹사이트 리뉴얼');
  await page.getByRole('button', { name: '저장' }).click();
  await expect(page.getByRole('heading', { name: '웹사이트 리뉴얼' })).toBeVisible();

  for (const title of ['디자인 시안', '퍼블리싱']) {
    await page.getByLabel('새 할 일 제목').fill(title);
    await page.getByLabel('새 할 일 제목').press('Enter');
    await expect(page.getByRole('checkbox', { name: `${title} 완료` })).toBeVisible();
  }
  await page.getByRole('checkbox', { name: '디자인 시안 완료' }).check();
  await page.reload();
  await expect(page.getByText('진행률 50% (1/2)')).toBeVisible();
  await page.goto('/projects');
  const card = page.getByRole('link', { name: /웹사이트 리뉴얼/ });
  await expect(card).toContainText('진행 중');
  await expect(card).toContainText('50% · 할 일 1/2');
});

test('노트 작성·태그·검색 (NOTE-01)', async ({ page }) => {
  await signUp(page);
  await page.goto('/knowledge');
  await page.getByRole('link', { name: '새로 만들기' }).click();
  await page.getByLabel('제목').fill('제품 아이디어 모음');
  await page.getByLabel('유형').selectOption('idea');
  await page.getByLabel('태그 (쉼표로 구분)').fill('아이디어, 제품');
  await page.getByLabel('내용').fill('생산성을 높이는 기능');
  await page.getByRole('button', { name: '저장' }).click();
  await expect(page).toHaveURL(/\/knowledge\/[0-9a-f-]{36}$/);

  await page.goto('/knowledge?q=생산성');
  await expect(page.getByRole('heading', { name: '제품 아이디어 모음' })).toBeVisible();
  await page.goto('/knowledge?q=없는검색어');
  await expect(page.getByText('조건에 맞는 항목이 없습니다')).toBeVisible();
});
