import { expect, test } from '@playwright/test';
import { signUp } from './helpers';

test('자동화 켜기 → 지금 실행 → 알림과 실행 이력 (AUTO-01, AUTO-02)', async ({ page }) => {
  await signUp(page);
  await page.goto('/automations');
  await expect(page.getByRole('switch')).toHaveCount(6);
  await expect(page.getByRole('switch', { name: '반복 할 일 사용' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByRole('switch', { name: '아침 업무 브리핑 사용' })).toHaveAttribute(
    'aria-checked',
    'false',
  );

  // 설정 변경 후 켜기
  await page.getByRole('button', { name: '아침 업무 브리핑 설정' }).click();
  await page.getByRole('dialog').getByLabel('실행 시각').fill('07:30');
  await page.getByRole('dialog').getByLabel('평일에만 보내기').check();
  await page.getByRole('dialog').getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByText('평일 07:30')).toBeVisible();
  await page.getByRole('switch', { name: '아침 업무 브리핑 사용' }).click();
  await expect(page.getByRole('switch', { name: '아침 업무 브리핑 사용' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByText(/다음 실행/).first()).toBeVisible();

  // 지금 실행 → 앱 내 알림
  await page.getByRole('button', { name: '아침 업무 브리핑 지금 실행' }).click();
  await expect(page.getByText("'아침 업무 브리핑'을(를) 실행했습니다.")).toBeVisible();
  await expect(page.getByRole('link', { name: /알림.*읽지 않음 1개/ })).toBeVisible();
  await page.goto('/notifications');
  await expect(page.getByText(/오늘의 브리핑/)).toBeVisible();

  // 실행 이력
  await page.goto('/automations?tab=runs');
  const row = page.getByRole('row', { name: /아침 업무 브리핑/ });
  await expect(row).toContainText('직접 실행');
  await expect(row).toContainText('성공');
});

test('반복 할 일은 다시 생성해도 중복되지 않는다 (TASK-02, 인수 테스트 #3)', async ({ page }) => {
  await signUp(page);
  await page.goto('/tasks');
  await page.getByRole('button', { name: '자세히 추가' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('제목').fill('물 마시기');
  await dialog.getByLabel('반복').selectOption('daily');
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: '물 마시기 완료' })).toHaveCount(1);
  await expect(page.getByLabel('반복').first()).toBeVisible();

  // 반복 생성 자동화를 여러 번 실행해도 오늘 회차는 하나
  await page.goto('/automations');
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: '반복 할 일 지금 실행' }).click();
    await expect(page.getByText("'반복 할 일'을(를) 실행했습니다.")).toBeVisible();
  }
  await page.goto('/tasks');
  await expect(page.getByRole('checkbox', { name: '물 마시기 완료' })).toHaveCount(1);

  // 반복 중지
  await page.getByRole('button', { name: '물 마시기 편집' }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '반복 중지' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('이메일 알림 수신 설정이 저장된다', async ({ page }) => {
  await signUp(page);
  await page.goto('/settings');
  const box = page.getByLabel(/자동화 알림을 이메일로도 받기/);
  await expect(box).toBeChecked();
  await box.uncheck();
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByText('저장했습니다.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(/자동화 알림을 이메일로도 받기/)).not.toBeChecked();
});
