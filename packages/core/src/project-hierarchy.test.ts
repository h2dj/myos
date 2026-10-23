import { expect, it } from 'vitest';
import { projectPath } from './project-hierarchy';
it('부모 경로를 표시하고 필터로 빠진 부모와 순환 데이터도 처리한다', () => {
  const a = { id: 'a', name: '상위', parentId: null };
  const b = { id: 'b', name: '하위', parentId: 'a' };
  const c = { id: 'c', name: '세부', parentId: 'b' };
  expect(projectPath(c, [a, b, c])).toBe('상위 / 하위 / 세부');
  expect(projectPath(c, [c])).toBe('세부');
  expect(projectPath(b, [{ ...a, parentId: 'b' }, b])).toBe('상위 / 하위');
});
