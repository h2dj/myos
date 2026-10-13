import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, softDelete, timestamps } from './_common';

/**
 * 앱 사용자 프로필. id는 Supabase Auth(auth.users)의 id와 동일하게 사용한다.
 * 로컬/테스트 환경에서는 auth 스키마가 없으므로 FK는 두지 않는다.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull().default('Asia/Seoul'),
  /** 이메일 알림 수신 (확정 사항 #3) */
  notifyEmail: boolean('notify_email').notNull().default(true),
  ...timestamps,
});

export const workspaceType = pgEnum('workspace_type', ['personal', 'shared']);

export const workspaces = pgTable(
  'workspaces',
  {
    id: id(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    type: workspaceType('type').notNull(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index('workspaces_owner_idx').on(t.ownerId),
    // 사용자당 개인 공간은 하나 (동시 첫 로그인에도 중복 생성 방지)
    uniqueIndex('workspaces_personal_owner_uq')
      .on(t.ownerId)
      .where(sql`${t.type} = 'personal'`),
  ],
);

/** owner: 초대·자동화·삭제 관리 / editor: 허용 항목 수정 / viewer: 읽기 (기획서 §7) */
export const workspaceRole = pgEnum('workspace_role', ['owner', 'editor', 'viewer']);

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: workspaceRole('role').notNull(),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index('workspace_members_user_idx').on(t.userId),
  ],
);
