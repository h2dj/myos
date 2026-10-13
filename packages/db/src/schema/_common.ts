import { timestamp, uuid } from 'drizzle-orm/pg-core';

/** 모든 테이블 공통: UUID PK + 생성/수정 시각 (기획서 §4) */
export const id = () => uuid('id').primaryKey().defaultRandom();

export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** 복구 가능한 항목용 소프트 삭제 */
export const softDelete = {
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
};
