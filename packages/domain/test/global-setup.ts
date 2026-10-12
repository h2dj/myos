import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb } from '@myos/db';

export default async function setup() {
  const { db, sql } = createDb(
    process.env.DATABASE_URL ?? 'postgres://myos:myos@localhost:5432/myos',
  );
  try {
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL('../../db/migrations', import.meta.url)),
    });
  } finally {
    await sql.end();
  }
}
