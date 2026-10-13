import { describe, expect, it } from 'vitest';
import { WIDGET_CATALOG, WIDGET_TYPES, isKpiMetric, moveItem } from './widgets';

describe('widgets', () => {
  it('8종 모두 정의되어 있다', () => {
    expect(WIDGET_TYPES).toHaveLength(8);
    for (const t of WIDGET_TYPES) expect(WIDGET_CATALOG[t].label).toBeTruthy();
  });
  it('moveItem은 경계를 넘지 않는다', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
  });
  it('isKpiMetric', () => {
    expect(isKpiMetric('tasks.progress')).toBe(true);
    expect(isKpiMetric('finance.spend')).toBe(false);
    expect(isKpiMetric(null)).toBe(false);
  });
});
