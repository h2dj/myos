import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * Supabase 트랜잭션 풀러(포트 6543, Vercel 같은 서버리스용)는 prepared statement를 지원하지 않는다.
 * URL로 판단하고, DB_PREPARE=false로 강제할 수도 있다.
 */
export function usesTransactionPooler(url: string): boolean {
  if (process.env.DB_PREPARE === 'false') return true;
  try {
    return new URL(url).port === '6543';
  } catch {
    return false;
  }
}

export function createDb(url = process.env.DATABASE_URL, opts: { max?: number } = {}) {
  if (!url) throw new Error('DATABASE_URL이 설정되지 않았습니다.');
  const pooled = usesTransactionPooler(url);
  const sql = postgres(url, {
    max: opts.max ?? (pooled ? 5 : 10),
    prepare: !pooled,
  });
  return { db: drizzle(sql, { schema }), sql };
}

export type Db = ReturnType<typeof createDb>['db'];
