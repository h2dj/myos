import { index, jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { id } from './_common';
import { users, workspaces } from './identity';

/** 개인 공간 소유자만 읽고 쓰는 불변 회고 스냅샷. */
export const lifeReviews = pgTable(
  'life_reviews',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('life_reviews_owner_idx').on(t.userId, t.workspaceId, t.createdAt)],
);
