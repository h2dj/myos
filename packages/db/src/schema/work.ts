import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { id, softDelete, timestamps } from './_common';
import { users, workspaces } from './identity';

const workspaceRef = () =>
  uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' });

// ── 프로젝트 ───────────────────────────────────────────────

export const projectStatus = pgEnum('project_status', [
  'planned',
  'active',
  'on_hold',
  'completed',
  'archived',
]);

export const projects = pgTable(
  'projects',
  {
    id: id(),
    workspaceId: workspaceRef(),
    parentId: uuid('parent_id').references((): AnyPgColumn => projects.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    description: text('description'),
    status: projectStatus('status').notNull().default('active'),
    startAt: timestamp('start_at', { withTimezone: true }),
    dueAt: timestamp('due_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index('projects_workspace_idx').on(t.workspaceId, t.status),
    index('projects_parent_idx').on(t.parentId),
  ],
);

/** 마감 없이 유지하는 사업·활동의 활동처(단체·회사·장소). */
export const activityPlaces = pgTable(
  'activity_places',
  {
    id: id(),
    workspaceId: workspaceRef(),
    name: text('name').notNull(),
    description: text('description'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index('activity_places_workspace_idx').on(t.workspaceId)],
);

export const activities = pgTable(
  'activities',
  {
    id: id(),
    workspaceId: workspaceRef(),
    name: text('name').notNull(),
    description: text('description'),
    placeId: uuid('place_id').references(() => activityPlaces.id, { onDelete: 'set null' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index('activities_workspace_idx').on(t.workspaceId)],
);

// ── 할 일 ─────────────────────────────────────────────────

export const taskStatus = pgEnum('task_status', ['todo', 'in_progress', 'done', 'cancelled']);
export const taskPriority = pgEnum('task_priority', ['none', 'low', 'medium', 'high']);

export const tasks = pgTable(
  'tasks',
  {
    id: id(),
    workspaceId: workspaceRef(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    activityId: uuid('activity_id').references(() => activities.id, { onDelete: 'set null' }),
    activityPlaceId: uuid('activity_place_id').references(() => activityPlaces.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    description: text('description'),
    status: taskStatus('status').notNull().default('todo'),
    priority: taskPriority('priority').notNull().default('none'),
    /** 예정일(노션 '예정일/기한'). 날짜만 지정하면 all_day=true */
    scheduledStart: timestamp('scheduled_start', { withTimezone: true }),
    scheduledEnd: timestamp('scheduled_end', { withTimezone: true }),
    allDay: boolean('all_day').notNull().default(true),
    /** 마감 시각 */
    dueAt: timestamp('due_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    sortOrder: integer('sort_order').notNull().default(0),
    /** 반복 시리즈(3단계). UNIQUE(series_id, occurrence_date)로 중복 생성 방지 */
    seriesId: uuid('series_id'),
    occurrenceDate: text('occurrence_date'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index('tasks_workspace_status_idx').on(t.workspaceId, t.status),
    index('tasks_project_idx').on(t.projectId),
    index('tasks_activity_idx').on(t.activityId),
    index('tasks_activity_place_idx').on(t.activityPlaceId),
    index('tasks_scheduled_idx').on(t.workspaceId, t.scheduledStart),
    uniqueIndex('tasks_series_occurrence_uq')
      .on(t.seriesId, t.occurrenceDate)
      .where(sql`${t.seriesId} is not null`),
  ],
);

// ── 노트 / 지식 ────────────────────────────────────────────

export const noteType = pgEnum('note_type', ['note', 'idea', 'resource']);

export const notes = pgTable(
  'notes',
  {
    id: id(),
    workspaceId: workspaceRef(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    content: text('content').notNull().default(''),
    type: noteType('type').notNull().default('note'),
    isFavorite: boolean('is_favorite').notNull().default(false),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index('notes_workspace_idx').on(t.workspaceId, t.type)],
);

// ── 인박스 ────────────────────────────────────────────────

export const inboxSource = pgEnum('inbox_source', ['quick_input', 'dashboard', 'import']);
export const inboxResult = pgEnum('inbox_result', ['task', 'note', 'archived']);

export const inboxItems = pgTable(
  'inbox_items',
  {
    id: id(),
    workspaceId: workspaceRef(),
    content: text('content').notNull(),
    source: inboxSource('source').notNull().default('quick_input'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    result: inboxResult('result'),
    /** 변환 결과 항목 id (task/note) */
    resultId: uuid('result_id'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [index('inbox_workspace_pending_idx').on(t.workspaceId, t.processedAt)],
);

// ── 태그 / 연결 ───────────────────────────────────────────

export const entityType = pgEnum('entity_type', [
  'task',
  'project',
  'note',
  'event',
  'activity',
  'place',
]);

export const tags = pgTable(
  'tags',
  {
    id: id(),
    workspaceId: workspaceRef(),
    name: text('name').notNull(),
    color: text('color').notNull().default('gray'),
    ...timestamps,
  },
  (t) => [uniqueIndex('tags_workspace_name_uq').on(t.workspaceId, t.name)],
);

export const entityTags = pgTable(
  'entity_tags',
  {
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    entityType: entityType('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tagId, t.entityType, t.entityId] }),
    index('entity_tags_entity_idx').on(t.entityType, t.entityId),
  ],
);

export const linkType = pgEnum('link_type', ['related', 'derived_from']);

/** 메모-할 일-프로젝트 간 참조 (기획서 §4.1). A05 '메모에서 할 일 생성'은 derived_from */
export const entityLinks = pgTable(
  'entity_links',
  {
    id: id(),
    workspaceId: workspaceRef(),
    sourceType: entityType('source_type').notNull(),
    sourceId: uuid('source_id').notNull(),
    targetType: entityType('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    linkType: linkType('link_type').notNull().default('related'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('entity_links_uq').on(
      t.sourceType,
      t.sourceId,
      t.targetType,
      t.targetId,
      t.linkType,
    ),
    index('entity_links_target_idx').on(t.targetType, t.targetId),
  ],
);

// ── 알림 ──────────────────────────────────────────────────

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    message: text('message'),
    link: text('link'),
    data: jsonb('data').$type<Record<string, unknown>>(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('notifications_user_unread_idx').on(t.userId, t.readAt, t.createdAt)],
);
