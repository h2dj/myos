import { expect, test, type Page } from '@playwright/test';
import { signUp } from './helpers';

async function project(page: Page, name: string) {
  await page.goto('/projects');
  await page.getByRole('button', { name: '프로젝트 추가', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('이름', { exact: true }).fill(name);
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  return page.url();
}
async function activity(page: Page, name: string, place = false) {
  await page.goto('/activities');
  await page
    .getByRole('button', { name: place ? '활동처 추가' : '사업·활동 추가', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('이름', { exact: true }).fill(name);
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
async function connect(page: Page, type: string, name: string) {
  const panel = page.getByRole('region', { name: '관련 항목', exact: true });
  await panel.getByLabel('연결 유형', { exact: true }).selectOption(type);
  await panel.getByLabel('연결할 항목', { exact: true }).selectOption({ label: name });
  await panel.getByRole('button', { name: '연결 추가', exact: true }).click();
  await expect(panel.getByRole('link', { name, exact: true })).toBeVisible();
}

test('프로젝트 상세에서 현재 프로젝트 아래에 하위 프로젝트를 추가한다', async ({ page }) => {
  await signUp(page);
  const parentUrl = await project(page, '부모 프로젝트');
  const parentId = parentUrl.split('/').pop()!;
  await page.getByRole('button', { name: '하위 프로젝트 추가', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '하위 프로젝트 추가', exact: true });
  await expect(dialog.getByLabel('상위 프로젝트', { exact: true })).toHaveValue(parentId);
  await expect(dialog.getByLabel('상위 프로젝트', { exact: true })).toBeDisabled();
  await dialog.getByLabel('이름', { exact: true }).fill('상세에서 만든 자식');
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '상세에서 만든 자식', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: '부모 프로젝트', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: '하위 프로젝트', exact: true })
      .getByRole('link', { name: '상세에서 만든 자식', exact: true }),
  ).toBeVisible();
});

test('활동 간 관계와 지식의 네 유형 연결·역방향 조회·해제', async ({ page }) => {
  await signUp(page);
  await project(page, '연계 프로젝트');
  await activity(page, '연계 활동');
  await activity(page, '협력 활동');
  await activity(page, '연계 장소', true);
  await page.getByRole('link', { name: '연계 활동 관련 항목', exact: true }).click();
  await expect(page).toHaveURL(/\/activities\/[a-f0-9-]+$/);
  const activityUrl = page.url();
  await connect(page, 'activity', '협력 활동');
  await connect(page, 'project', '연계 프로젝트');
  const panel = page.getByRole('region', { name: '관련 항목', exact: true });
  await panel.getByRole('link', { name: '협력 활동', exact: true }).click();
  await expect(panel.getByRole('link', { name: '연계 활동', exact: true })).toBeVisible();
  await page.goto('/tasks');
  await page.getByLabel('새 할 일 제목').fill('연계 할 일');
  await page.getByLabel('새 할 일 제목').press('Enter');
  await expect(page.getByRole('checkbox', { name: '연계 할 일 완료', exact: true })).toBeVisible();
  await page.goto('/knowledge/new?type=idea');
  await page.getByLabel('제목', { exact: true }).fill('연계 아이디어');
  await page.getByLabel('내용', { exact: true }).fill('여러 업무에 공유할 참고 내용');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page).toHaveURL(/\/knowledge\/[a-f0-9-]+$/);
  const noteUrl = page.url();
  await connect(page, 'project', '연계 프로젝트');
  await connect(page, 'activity', '연계 활동');
  await connect(page, 'place', '연계 장소');
  await connect(page, 'task', '연계 할 일');
  await panel.getByRole('link', { name: '연계 할 일', exact: true }).click();
  await expect(panel.getByRole('link', { name: '연계 아이디어', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: '연계 아이디어 연결 해제', exact: true }).click();
  await expect(panel.getByRole('link', { name: '연계 아이디어', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('제목', { exact: true })).toHaveValue('연계 할 일');
  await page.goto(noteUrl);
  await expect(panel.getByRole('link', { name: '연계 할 일', exact: true })).toHaveCount(0);
  await expect(panel.getByRole('link', { name: '연계 장소', exact: true })).toBeVisible();
  await page.goto(activityUrl);
  await expect(panel.getByRole('link', { name: '연계 아이디어', exact: true })).toBeVisible();
});

test('계좌·예산 설명과 여러 추가 메모를 저장·수정·삭제한다', async ({ page }) => {
  await signUp(page);
  await page.goto('/finance');
  await page.getByRole('button', { name: '계좌 추가', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('계좌 이름', { exact: true }).fill('설명 통장');
  await dialog.getByLabel('계좌 설명', { exact: true }).fill('매월 20일 자동이체');
  await dialog.getByRole('button', { name: '계좌 저장', exact: true }).click();
  await expect(page.getByRole('article', { name: '설명 통장 계좌', exact: true })).toContainText(
    '매월 20일 자동이체',
  );
  await page.getByRole('button', { name: '설명 통장 추가 메모', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('추가 메모 내용', { exact: true }).fill('납부일 변경');
  await dialog.getByRole('button', { name: '메모 추가', exact: true }).click();
  await expect(dialog.getByRole('listitem').filter({ hasText: '납부일 변경' })).toBeVisible();
  await dialog.getByLabel('추가 메모 내용', { exact: true }).fill('자동이체 확인 완료');
  await dialog.getByRole('button', { name: '메모 추가', exact: true }).click();
  await expect(dialog.getByRole('listitem')).toHaveCount(2);
  await dialog.getByRole('button', { name: '납부일 변경 메모 수정', exact: true }).click();
  await dialog.getByLabel('추가 메모 내용', { exact: true }).fill('납부일 25일로 변경');
  await dialog.getByRole('button', { name: '메모 수정 저장', exact: true }).click();
  await expect(
    dialog.getByRole('listitem').filter({ hasText: '납부일 25일로 변경' }),
  ).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await dialog.getByRole('button', { name: '납부일 25일로 변경 메모 삭제', exact: true }).click();
  await expect(dialog.getByRole('listitem')).toHaveCount(1);
  await dialog.getByRole('button', { name: '닫기', exact: true }).click();
  await page.getByRole('button', { name: '예산 추가', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('예산 카테고리').fill('식비');
  await dialog.getByLabel('예산 금액 (원)').fill('100000');
  await dialog.getByLabel('예산 설명').fill('외식과 장보기 포함');
  await dialog.getByRole('button', { name: '예산 저장', exact: true }).click();
  await expect(page.getByRole('article', { name: '식비 예산', exact: true })).toContainText(
    '외식과 장보기 포함',
  );
  await page.getByRole('button', { name: '식비 예산 추가 메모', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('추가 메모 내용').fill('이번 주 회식 예정');
  await dialog.getByRole('button', { name: '메모 추가', exact: true }).click();
  await expect(dialog.getByRole('listitem')).toContainText('이번 주 회식 예정');
  await page.reload();
  await page.getByRole('button', { name: '식비 예산 추가 메모', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('listitem')).toContainText('이번 주 회식 예정');
});
