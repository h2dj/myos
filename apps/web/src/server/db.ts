import 'server-only';
import { createDb, type Db } from '@myos/db';

// 개발 중 HMR로 모듈이 다시 로드되어도 커넥션 풀을 하나만 쓰도록 전역에 보관한다
const globalForDb = globalThis as unknown as { myosDb?: Db };

function instance(): Db {
  globalForDb.myosDb ??= createDb().db;
  return globalForDb.myosDb;
}

/** 첫 사용 시점에 연결한다 (빌드 단계에서는 DATABASE_URL이 없어도 된다) */
export const db: Db = new Proxy({} as Db, {
  get(_, prop) {
    const target = instance();
    const value = Reflect.get(target, prop, target);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});
