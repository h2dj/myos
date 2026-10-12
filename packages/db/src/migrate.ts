import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb } from './client';

const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

const { db, sql } = createDb();
try {
  await migrate(db, { migrationsFolder });
  console.log('마이그레이션 완료');
} finally {
  await sql.end();
}
