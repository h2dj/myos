import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ALL_NAV, isActive } from './navigation';

const appDir = fileURLToPath(new URL('../app/(app)', import.meta.url));

describe('navigation', () => {
  it.each(ALL_NAV.map((n) => [n.href]))('%s 경로에 페이지가 있다', (href) => {
    expect(existsSync(`${appDir}${href}/page.tsx`)).toBe(true);
  });

  it('href가 중복되지 않는다', () => {
    const hrefs = ALL_NAV.map((n) => n.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('하위 경로도 활성으로 본다', () => {
    expect(isActive('/tasks/123', '/tasks')).toBe(true);
    expect(isActive('/tasksx', '/tasks')).toBe(false);
  });
});
