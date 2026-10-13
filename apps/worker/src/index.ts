import { createDb } from '@myos/db';
import { createMailer } from '@myos/domain';
import { PgBoss } from 'pg-boss';
import { QUEUES, SCHEDULES, purge, tick } from './jobs';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL이 설정되지 않았습니다.');

const { db, sql } = createDb(url);
const mailer = createMailer();
const deps = { mailer, appUrl: process.env.APP_URL ?? 'http://localhost:3000' };

const boss = new PgBoss({ connectionString: url, schema: 'pgboss' });
boss.on('error', (err) => console.error('[worker] pg-boss error', err));

await boss.start();
for (const [queue, cron] of Object.entries(SCHEDULES)) {
  await boss.createQueue(queue);
  // pg-boss 스케줄은 워커가 여러 대여도 회차당 한 번만 발생한다
  await boss.schedule(queue, cron, {}, { tz: 'Asia/Seoul' });
}
// 이전 버전에서 쓰던 하트비트 스케줄 정리
await boss.unschedule('system.heartbeat').catch(() => {});

await boss.work(QUEUES.tick, async () => {
  const result = await tick(db, deps);
  if (result.ran || result.retried) console.log('[worker] tick', result);
});
await boss.work(QUEUES.purge, async () => {
  console.log('[worker] purge', await purge(db));
});

console.log(`[worker] started (mail: ${mailer.channel})`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await boss.stop({ graceful: true });
    await sql.end();
    process.exit(0);
  });
}
