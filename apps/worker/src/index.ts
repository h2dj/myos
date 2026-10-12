import { PgBoss } from 'pg-boss';
import { QUEUES } from './jobs';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL이 설정되지 않았습니다.');

const boss = new PgBoss({ connectionString: url, schema: 'pgboss' });
boss.on('error', (err) => console.error('[worker] pg-boss error', err));

await boss.start();
await boss.createQueue(QUEUES.heartbeat);
await boss.schedule(QUEUES.heartbeat, '*/5 * * * *', {}, { tz: 'Asia/Seoul' });
await boss.work(QUEUES.heartbeat, async () => {
  console.log(`[worker] heartbeat ${new Date().toISOString()}`);
});

console.log('[worker] started');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await boss.stop({ graceful: true });
    process.exit(0);
  });
}
