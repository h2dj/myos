import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from './helpers';

describe('DB 보안', () => {
  // Supabase는 public 스키마를 anon 키로 REST API에 노출하므로, 새 테이블도 반드시 RLS가 켜져 있어야 한다.
  // 새 테이블을 추가했다면 마이그레이션에 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`를 넣을 것.
  it('public 스키마의 모든 테이블에 RLS가 켜져 있다', async () => {
    const rows = await db.execute<{ tablename: string }>(
      sql`select tablename from pg_tables where schemaname = 'public' and not rowsecurity`,
    );
    expect(rows.map((r) => r.tablename)).toEqual([]);
  });
});
