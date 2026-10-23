import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { createDb } from '@myos/db';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { Logger } from 'drizzle-orm/logger';

const exec = promisify(execFile);
const env = { ...process.env };
for (const key of [
  'DOCKER_HOST',
  'DOCKER_CONTEXT',
  'DOCKER_TLS',
  'DOCKER_TLS_VERIFY',
  'DOCKER_CERT_PATH',
])
  delete env[key];
const docker = (args: string[]) =>
  exec('docker', ['--host=unix:///var/run/docker.sock', ...args], {
    env,
    maxBuffer: 1024 * 1024,
    timeout: 120_000,
  });

/** 새 로컬 Docker 컨테이너만 사용하며 종료 시 자체 자원을 정리한다. */
export async function withIsolatedDb<T>(
  fn: (conn: ReturnType<typeof createDb>) => Promise<T>,
  logger?: Logger,
): Promise<T> {
  const name = `myos-backup-${randomUUID()}`;
  const database = `myos_restore_${randomUUID().replaceAll('-', '')}`;
  const password = randomBytes(24).toString('hex');
  const temp = await mkdtemp(join(tmpdir(), 'myos-backup-'));
  const envFile = join(temp, 'postgres.env');
  let conn: ReturnType<typeof createDb> | undefined;
  try {
    await writeFile(
      envFile,
      `POSTGRES_USER=myos\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=${database}\n`,
      { mode: 0o600 },
    );
    await docker(['info', '--format', '{{.ServerVersion}}']);
    await docker([
      'run',
      '--detach',
      '--rm',
      '--name',
      name,
      '--label',
      'myos.backup-verification=1',
      '--env-file',
      envFile,
      '--publish',
      '127.0.0.1::5432',
      'postgres:16',
    ]);
    let ready = false;
    for (let n = 0; n < 60; n++) {
      try {
        // The entrypoint's initialization server accepts Unix sockets before its final restart.
        // TCP readiness waits for the final server used by postgres.js.
        await docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'myos', '-d', database]);
        ready = true;
        break;
      } catch {
        await setTimeout(500);
      }
    }
    if (!ready) throw new Error('임시 DB 시작 실패');
    const port = (await docker(['port', name, '5432/tcp'])).stdout
      .trim()
      .match(/^127\.0\.0\.1:(\d+)$/)?.[1];
    if (!port) throw new Error('임시 DB 포트 확인 실패');
    // 외부 접속 URL을 받지 않는다. DATABASE_URL도 사용하지 않는다.
    conn = createDb(`postgres://myos:${password}@127.0.0.1:${port}/${database}`, { logger });
    await migrate(conn.db, {
      migrationsFolder: fileURLToPath(new URL('../../db/migrations', import.meta.url)),
    });
    return await fn(conn);
  } finally {
    await conn?.sql.end().catch(() => {});
    await docker(['rm', '--force', '--volumes', name]).catch(() => {});
    await rm(temp, { recursive: true, force: true });
  }
}
