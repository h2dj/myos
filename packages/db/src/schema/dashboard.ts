import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, timestamps } from './_common';
import { users, workspaces } from './identity';

export const dashboardPeriod = pgEnum('dashboard_period', ['today', 'week', 'all']);

/** 대시보드 영역 필터: 프로젝트 또는 태그 (기획서 DASH-03 '활동 영역') */
export interface AreaFilter {
  projectId?: string;
  tag?: string;
}

/** 사용자별 대시보드 (공간마다 하나) */
export const dashboards = pgTable(
  'dashboards',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull().default('개인 대시보드'),
    period: dashboardPeriod('period').notNull().default('today'),
    filters: jsonb('filters').$type<AreaFilter>().notNull().default({}),
    ...timestamps,
  },
  (t) => [uniqueIndex('dashboards_user_workspace_uq').on(t.userId, t.workspaceId)],
);

export const widgetType = pgEnum('widget_type', [
  'tasks',
  'schedule',
  'projects',
  'inbox',
  'automations',
  'kpi',
  'recent_notes',
  'shortcuts',
]);
export const widgetSize = pgEnum('widget_size', ['sm', 'md', 'lg', 'full']);
export const widgetRefresh = pgEnum('widget_refresh', ['on_load', 'interval_5m']);
export const widgetAccess = pgEnum('widget_access', ['private', 'workspace']);

/** 위젯 공통 속성 (기획서 §2.1) */
export const dashboardWidgets = pgTable(
  'dashboard_widgets',
  {
    id: id(),
    dashboardId: uuid('dashboard_id')
      .notNull()
      .references(() => dashboards.id, { onDelete: 'cascade' }),
    type: widgetType('type').notNull(),
    title: text('title'),
    /** KPI 등 데이터 원천 키. null이면 미설정 */
    dataSource: text('data_source'),
    filters: jsonb('filters').$type<AreaFilter>().notNull().default({}),
    displayConfig: jsonb('display_config').$type<Record<string, unknown>>().notNull().default({}),
    position: integer('position').notNull(),
    size: widgetSize('size').notNull().default('md'),
    hidden: boolean('hidden').notNull().default(false),
    refreshPolicy: widgetRefresh('refresh_policy').notNull().default('on_load'),
    accessScope: widgetAccess('access_scope').notNull().default('private'),
    ...timestamps,
  },
  (t) => [index('dashboard_widgets_dashboard_idx').on(t.dashboardId, t.position)],
);
