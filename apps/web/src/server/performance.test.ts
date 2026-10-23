import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { measure } from './performance';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe('작업 성능 기록', () => {
  it('기본값에서는 기록하지 않고 반환값을 보존한다', async () => {
    vi.stubEnv('PERFORMANCE_LOGGING', '');
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    expect(await measure('task.create', 'mutation', () => 42)).toBe(42);
    expect(log).not.toHaveBeenCalled();
  });
  it('실패해도 원래 예외를 유지하며 내용·ID·SQL을 기록하지 않는다', async () => {
    vi.stubEnv('PERFORMANCE_LOGGING', '1');
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    const error = new Error('비공개 제목 SQL password');
    await expect(
      measure('task.update', 'mutation', () => {
        throw error;
      }),
    ).rejects.toBe(error);
    const event = JSON.parse(log.mock.calls[0]![0] as string);
    expect(event).toMatchObject({
      type: 'myos.performance',
      operation: 'task.update',
      phase: 'mutation',
      ok: false,
    });
    expect(Object.keys(event).sort()).toEqual(['durationMs', 'ok', 'operation', 'phase', 'type']);
    expect(JSON.stringify(event)).not.toContain('비공개');
  });
  it('기록 장치가 실패해도 원래 결과와 예외를 보존한다', async () => {
    vi.stubEnv('PERFORMANCE_LOGGING', '1');
    vi.spyOn(console, 'info').mockImplementation(() => {
      throw new Error('기록 실패');
    });
    expect(await measure('task.create', 'mutation', () => 42)).toBe(42);
    const error = new Error('업무 오류');
    await expect(
      measure('task.update', 'mutation', () => {
        throw error;
      }),
    ).rejects.toBe(error);
  });
});
