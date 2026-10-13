import type { Db } from '@myos/db';

/** 트랜잭션 안팎에서 공통으로 쓰는 실행기 */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type Executor = Db | Tx;

/** 요청을 수행하는 사용자. 모든 서비스 함수는 이 값으로 권한을 다시 검사한다. */
export interface Actor {
  userId: string;
}
