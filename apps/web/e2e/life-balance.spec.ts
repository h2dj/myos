import { expect, test } from '@playwright/test';
import { signUp, waitForServerAction } from './helpers';

test('삶의 균형: 완료 활동 연결·합산·저장·이력·PERMA', async ({ page }) => {
  await signUp(page);
  await page.goto('/tasks');
  await page.getByRole('button', { name: '자세히 추가' }).click();
  await page.getByRole('dialog').getByLabel('제목', { exact: true }).fill('회고를 위한 산책');
  await page.getByLabel('태그 (쉼표로 구분)').fill('삶:건강');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await waitForServerAction(page, () =>
    page.getByRole('checkbox', { name: '회고를 위한 산책 완료', exact: true }).check(),
  );
  await page.goto('/life-balance');
  const scores = page.getByLabel(/자기평가 \(0~10\)/);
  await expect(scores).toHaveCount(8);
  for (const score of await scores.all()) await score.fill('6');
  await page.getByLabel('다음에 할 작은 행동').fill('가족과 함께 산책하기');
  await page.getByRole('button', { name: '활동 불러오고 점수 계산' }).click();
  const result = page.getByRole('region', { name: '현재 회고 결과' });
  await expect(result.getByRole('row', { name: /건강/ })).toContainText('1 / 4');
  await expect(result.getByRole('row', { name: /건강/ })).toContainText('2.5');
  await expect(result.getByRole('row', { name: /일·경력/ })).toContainText('자기평가만');
  await expect(
    result.getByRole('row', { name: /일·경력/ }).getByRole('cell', { name: '6.0', exact: false }),
  ).toHaveCount(2);
  await expect(result.getByRole('img', { name: /레이더 차트/ })).toBeVisible();
  await result.getByText(/집계 근거 확인/).click();
  await expect(result.getByRole('link', { name: '회고를 위한 산책' })).toBeVisible();
  await page.getByRole('button', { name: '회고 저장', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('회고를 저장했습니다.');
  const history = page.getByRole('region', { name: '저장된 회고' });
  await expect(history.getByText('가족과 함께 산책하기', { exact: false })).toBeVisible();
  await page.reload();
  await page.getByLabel('회고 기록 선택').selectOption({ index: 1 });
  await expect(history.getByRole('row', { name: /건강/ })).toContainText('1 / 4');
  await page.getByLabel('프레임워크', { exact: true }).selectOption('perma');
  await expect(scores).toHaveCount(5);
  for (const score of await scores.all()) await score.fill('6');
  await page.getByRole('button', { name: '활동 불러오고 점수 계산' }).click();
  await expect(result.getByRole('row', { name: /긍정정서/ })).toContainText('6.0');
  await expect(result).toContainText('미분류 1건');
  await page.getByLabel('자기평가 비중 (%)', { exact: true }).fill('100');
  await expect(result).toHaveCount(0);
  await page.getByLabel('자기평가 비중 (%)', { exact: true }).fill('0');
  await page.getByRole('button', { name: '활동 불러오고 점수 계산' }).click();
  await expect(result).toContainText('기록 없음');
  await expect(result.getByRole('row', { name: /긍정정서/ })).toContainText('자기평가만');
  await expect(
    result.getByRole('row', { name: /긍정정서/ }).getByRole('cell', { name: /6.0/ }),
  ).toHaveCount(2);
  page.on('dialog', (dialog) => dialog.accept());
  await history.getByRole('button', { name: '이 회고 삭제' }).click();
  await expect(page.getByText('아직 저장한 회고가 없습니다.')).toBeVisible();
});
