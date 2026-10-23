export const TIMING_OPERATIONS = [
  'action',
  'session',
  'task.create',
  'task.update',
  'task.status',
  'task.quick',
  'task.delete',
  'task.restore',
  'tasks.list',
  'projects.options',
] as const;
export const TIMING_PHASES = [
  'session',
  'mutation',
  'invalidation',
  'total',
  'identity',
  'workspaces',
  'profile',
  'query',
] as const;
export type TimingOperation = (typeof TIMING_OPERATIONS)[number];
export type TimingPhase = (typeof TIMING_PHASES)[number];
export interface TimingEvent {
  type: 'myos.performance';
  operation: TimingOperation;
  phase: TimingPhase;
  durationMs: number;
  ok: boolean;
}
export function isTimingEvent(value: unknown): value is TimingEvent {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.type === 'myos.performance' &&
    TIMING_OPERATIONS.some((x) => x === v.operation) &&
    TIMING_PHASES.some((x) => x === v.phase) &&
    typeof v.durationMs === 'number' &&
    Number.isFinite(v.durationMs) &&
    v.durationMs >= 0 &&
    typeof v.ok === 'boolean'
  );
}
export function percentiles(values: number[]) {
  if (!values.length) throw new Error('측정값이 없습니다.');
  const sorted = [...values].sort((a, b) => a - b);
  return {
    samples: sorted.length,
    p50Ms: sorted[Math.ceil(sorted.length * 0.5) - 1]!,
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1]!,
  };
}
/** 알려진 작업/구간과 숫자만 남긴다. 원본 로그 내용은 보고서에 포함하지 않는다. */
export function summarizeTimings(events: unknown[]) {
  const groups = new Map<string, TimingEvent[]>();
  for (const event of events)
    if (isTimingEvent(event)) {
      const key = `${event.operation}/${event.phase}`;
      groups.set(key, [...(groups.get(key) ?? []), event]);
    }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, rows]) => ({
      key,
      ...percentiles(rows.map((r) => r.durationMs)),
      failures: rows.filter((r) => !r.ok).length,
    }));
}
