import 'server-only';
import { isTimingEvent, type TimingOperation, type TimingPhase } from '@myos/core';

export function recordTiming(
  operation: TimingOperation,
  phase: TimingPhase,
  started: number,
  ok: boolean,
) {
  if (process.env.PERFORMANCE_LOGGING !== '1') return;
  // 새 객체를 만들어 호출자의 임의 필드·예외·SQL·사용자 ID가 섞일 수 없게 한다.
  const event = {
    type: 'myos.performance',
    operation,
    phase,
    durationMs: Math.round((performance.now() - started) * 100) / 100,
    ok,
  };
  if (isTimingEvent(event)) {
    try {
      console.info(JSON.stringify(event));
    } catch {
      /* 측정 기록 실패가 업무 처리를 막지 않게 한다. */
    }
  }
}
export async function measure<T>(
  operation: TimingOperation,
  phase: TimingPhase,
  fn: () => T | Promise<T>,
): Promise<T> {
  const start = performance.now();
  let ok = false;
  try {
    const result = await fn();
    ok = true;
    return result;
  } finally {
    recordTiming(operation, phase, start, ok);
  }
}
