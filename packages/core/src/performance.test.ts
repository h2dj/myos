import { describe, expect, it } from 'vitest';
import { isTimingEvent, percentiles, summarizeTimings } from './performance';

describe('성능 집계', () => {
  it('최근접 순위 방식으로 p50/p95를 계산하며 입력을 변경하지 않는다', () => {
    const values = Array.from({ length: 20 }, (_, n) => 20 - n);
    expect(percentiles(values)).toEqual({ samples: 20, p50Ms: 10, p95Ms: 19 });
    expect(values[0]).toBe(20);
    expect(() => percentiles([])).toThrow();
  });
  it('알려진 작업·숫자·성공 여부만 집계하고 임의 내용은 버린다', () => {
    const event = {
      type: 'myos.performance',
      operation: 'task.create',
      phase: 'total',
      durationMs: 12,
      ok: true,
    };
    expect(isTimingEvent({ ...event, durationMs: Infinity })).toBe(false);
    expect(isTimingEvent({ ...event, durationMs: -1 })).toBe(false);
    expect(isTimingEvent({ ...event, operation: 'private task title' })).toBe(false);
    const report = summarizeTimings([
      null,
      '내용',
      event,
      { ...event, durationMs: 20, ok: false, title: '비공개 제목', token: 'token-value' },
      { ...event, phase: 'query-raw-sql' },
    ]);
    expect(report).toEqual([
      { key: 'task.create/total', samples: 2, p50Ms: 12, p95Ms: 20, failures: 1 },
    ]);
    expect(JSON.stringify(report)).not.toContain('비공개');
    expect(JSON.stringify(report)).not.toContain('token-value');
  });
});
