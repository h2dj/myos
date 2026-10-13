import { describe, expect, it } from 'vitest';
import { usesTransactionPooler } from './client';

describe('usesTransactionPooler', () => {
  it('Supabase 트랜잭션 풀러(6543)만 prepare를 끈다', () => {
    expect(
      usesTransactionPooler(
        'postgres://u:p@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres',
      ),
    ).toBe(true);
    expect(
      usesTransactionPooler(
        'postgres://u:p@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres',
      ),
    ).toBe(false);
    expect(usesTransactionPooler('postgres://myos:myos@localhost:5432/myos')).toBe(false);
  });
});
