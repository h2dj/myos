import type { Db } from '@myos/db';
import { purgeExpired, retryFailedRuns, runDueAutomations, type EngineDeps } from '@myos/domain';

export const QUEUES = {
  /** 1분마다: 예약 시각이 된 자동화 실행 + 재시도 시각이 된 실패 실행 재시도 */
  tick: 'automation.tick',
  /** 매일 새벽: 보존 기간이 지난 데이터 정리 */
  purge: 'maintenance.purge',
} as const;

export const SCHEDULES = {
  [QUEUES.tick]: '* * * * *',
  [QUEUES.purge]: '10 3 * * *',
} as const;

export async function tick(db: Db, deps: EngineDeps, now = new Date()) {
  const ran = await runDueAutomations(db, deps, now);
  const retried = await retryFailedRuns(db, deps, now);
  return {
    ran: ran.filter((r) => r.status !== 'duplicate').length,
    retried: retried.filter((r) => r.status !== 'duplicate').length,
    failed: [...ran, ...retried].filter((r) => r.status === 'failed').length,
  };
}

export function purge(db: Db, now = new Date()) {
  return purgeExpired(db, now);
}
